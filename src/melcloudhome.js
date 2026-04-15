import axios from 'axios';
import crypto from 'crypto';
import EventEmitter from 'events';
import ImpulseGenerator from './impulsegenerator.js';
import Functions from './functions.js';
import RequestPacer from './requestpacer.js';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { URL } from 'url';
import { ApiUrls } from './constants.js';

class MelCloudHome extends EventEmitter {
    constructor(account, pluginStart = false) {
        super();

        this.user = account.user;
        this.passwd = account.passwd;
        this.logInfo = account.log?.info;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        this.pacer = new RequestPacer();

        // Axios clients
        this.authClient = null; // cookie-jar client używany tylko podczas auth flow
        this.client = null; // API client używany do requestów po zalogowaniu

        // Token state
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0; // Unix timestamp (sekundy)

        // Flaga zapobiegająca wielokrotnemu dodaniu interceptorów
        this._interceptorsAttached = false;

        if (pluginStart) {
            this.impulseGenerator = new ImpulseGenerator()
                .on('checkDevicesList', async () => {
                    await this.checkDevicesList();
                })
                .on('state', (state) => {
                    this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
                });
        }
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    capitalizeKeysDeep(obj) {
        if (Array.isArray(obj)) return obj.map(item => this.capitalizeKeysDeep(item));
        if (obj && typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [
                    k.charAt(0).toUpperCase() + k.slice(1),
                    this.capitalizeKeysDeep(v),
                ])
            );
        }
        return obj;
    }

    // ── Token state ───────────────────────────────────────────────────────────

    isTokenExpired() {
        if (!this.accessToken) return true;
        return Date.now() / 1000 >= this.tokenExpiry - 60;
    }

    // ── Axios clients ─────────────────────────────────────────────────────────

    ensureAuthClient() {
        if (this.authClient) return this.authClient;

        const jar = new CookieJar();
        const instance = wrapper(
            axios.create({
                jar,
                timeout: 30_000,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': ApiUrls.Home.UserAgent,
                },
                maxRedirects: 5,
                validateStatus: () => true,
            })
        );

        this.authClient = instance;
        return instance;
    }

    ensureClient() {
        if (this.client) return this.client;

        this.client = axios.create({
            baseURL: ApiUrls.Home.BaseMobile,
            timeout: 30_000,
            headers: {
                Accept: 'application/json',
                'User-Agent': ApiUrls.Home.UserAgent,
            },
        });

        return this.client;
    }

    // ── Pacer helper ──────────────────────────────────────────────────────────

    pace(fn) {
        return this.pacer.run(fn);
    }

    // ── PKCE ──────────────────────────────────────────────────────────────────

    generatePkce() {
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        return { verifier, challenge };
    }

    // ── CSRF token ────────────────────────────────────────────────────────────

    extractCsrfToken(html) {
        return (
            /<input[^>]+name="_csrf"[^>]+value="([^"]+)"/.exec(html)?.[1] ??
            /<input[^>]+value="([^"]+)"[^>]+name="_csrf"/.exec(html)?.[1] ??
            /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ??
            null
        );
    }

    // ── Follow callback redirect ──────────────────────────────────────────────

    async followCallbackForCode(client, callbackQs) {
        const qs = callbackQs.replace(/&amp;/g, '&');
        const callbackUrl = `${ApiUrls.Home.AuthBase}/connect/authorize/callback?${qs}`;

        const resp = await this.pace(() =>
            client.get(callbackUrl, {
                headers: { 'User-Agent': ApiUrls.Home.UserAgent },
                maxRedirects: 0,
            })
        );
        let location = resp.headers?.location ?? '';

        if (location.startsWith('melcloudhome://')) {
            const m = /code=([^&]+)/.exec(location);
            if (m) return m[1];
        }

        if (!location || location === '/')
            throw new Error('Callback returned empty or root redirect');

        // Jeden dodatkowy hop
        const redirectUrl = location.startsWith('http')
            ? location
            : `${ApiUrls.Home.AuthBase}${location}`;

        const resp2 = await this.pace(() =>
            client.get(redirectUrl, {
                headers: { 'User-Agent': ApiUrls.Home.UserAgent },
                maxRedirects: 0,
            })
        );
        location = resp2.headers?.location ?? '';

        const m = /code=([^&]+)/.exec(location);
        if (!m) throw new Error('Failed to extract auth code from redirect');
        return m[1];
    }

    // ── Token exchange ────────────────────────────────────────────────────────

    async exchangeCodeForTokens(client, authCode, codeVerifier) {
        if (this.logDebug) this.emit('debug', 'Step 6: Token exchange');

        const resp = await this.pace(() =>
            client.post(
                `${ApiUrls.Home.AuthBase}/connect/token`,
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: authCode,
                    redirect_uri: ApiUrls.Home.OauthRedirectUri,
                    code_verifier: codeVerifier,
                    client_id: ApiUrls.Home.OauthClientId,
                }),
                { headers: { 'User-Agent': ApiUrls.Home.UserAgent } }
            )
        );

        if (resp.status >= 500) throw new Error(`Token exchange server error: HTTP ${resp.status}`);
        if (resp.status !== 200) throw new Error(`Token exchange failed: HTTP ${resp.status}`);

        this.accessToken = resp.data.access_token;
        this.refreshToken = resp.data.refresh_token ?? this.refreshToken;
        this.tokenExpiry = Date.now() / 1000 + (resp.data.expires_in ?? 3600);

        if (this.logDebug) this.emit('debug', 'Authentication successful');
        return true;
    }

    // ── Token refresh ─────────────────────────────────────────────────────────

    async refreshAccessToken() {
        if (!this.refreshToken) throw new Error('No refresh token available');

        const client = this.ensureAuthClient();

        const resp = await this.pace(() =>
            client.post(
                `${ApiUrls.Home.AuthBase}/connect/token`,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: ApiUrls.Home.OauthClientId,
                }),
                { headers: { 'User-Agent': ApiUrls.Home.UserAgent } }
            )
        );

        if (resp.status !== 200) {
            this.accessToken = null;
            this.refreshToken = null;
            throw new Error('Refresh token rejected');
        }

        this.accessToken = resp.data.access_token;
        this.refreshToken = resp.data.refresh_token ?? this.refreshToken;
        this.tokenExpiry = Date.now() / 1000 + (resp.data.expires_in ?? 3600);
        return true;
    }

    // ── Auto-refresh: refresh token lub pełne logowanie od nowa ──────────────

    async refreshOrRelogin() {
        if (this.refreshToken) {
            try {
                await this.refreshAccessToken();
                if (this.logDebug) this.emit('debug', 'Token refreshed successfully');
                return;
            } catch (err) {
                if (this.logDebug) this.emit('debug', `Refresh token rejected (${err.message}), falling back to full re-login`);
            }
        }

        if (this.logDebug) this.emit('debug', 'Performing full re-login');
        await this.connect();
    }

    // ── Interceptory do automatycznego odświeżania tokena ─────────────────────

    attachTokenInterceptors() {
        if (this._interceptorsAttached) return;
        this._interceptorsAttached = true;

        const apiClient = this.ensureClient();

        // Request interceptor — dokłada aktualny token przed każdym requestem.
        // Jeśli token wygasł, odświeża go najpierw.
        apiClient.interceptors.request.use(async (config) => {
            if (this.isTokenExpired()) {
                if (this.logDebug) this.emit('debug', 'Token expired or missing — refreshing before request');
                await this.refreshOrRelogin();
            }
            config.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return config;
        });

        // Response interceptor — obsługuje 401 który może przyjść mimo świeżego tokena
        // (np. token odwołany po stronie serwera). Ponawia request dokładnie raz.
        apiClient.interceptors.response.use(
            response => response,
            async (error) => {
                const originalRequest = error.config;

                if (error.response?.status === 401 && !originalRequest._retried) {
                    originalRequest._retried = true;
                    if (this.logDebug) this.emit('debug', 'Got 401 — refreshing token and retrying request');

                    try {
                        await this.refreshOrRelogin();
                        originalRequest.headers['Authorization'] = `Bearer ${this.accessToken}`;
                        return apiClient(originalRequest);
                    } catch (refreshError) {
                        this.emit('error', `Token refresh failed: ${refreshError.message}`);
                        return Promise.reject(refreshError);
                    }
                }

                return Promise.reject(error);
            }
        );
    }

    // ── Buduje connectInfo po udanym token exchange ───────────────────────────

    buildConnectInfo(connectInfo, exchangeRes) {
        if (exchangeRes) {
            // ensureClient() tworzy client jeśli nie istnieje.
            // attachTokenInterceptors() dodaje interceptory tylko przy pierwszym wywołaniu.
            this.ensureClient();
            this.attachTokenInterceptors();
            this.emit('client', this.client);
        }

        connectInfo.State = exchangeRes;
        connectInfo.Status = exchangeRes ? 'Connect Success' : 'Connect Failed at token exchange';

        return connectInfo;
    }

    // ── Scenes & Devices ──────────────────────────────────────────────────────

    async checkScenesList() {
        try {
            if (this.logDebug) this.emit('debug', 'Scanning for scenes');

            const resp = await this.client.get(ApiUrls.Home.Get.Scenes);
            const scenesList = resp.data;

            if (this.logDebug) this.emit('debug', `Scenes: ${JSON.stringify(scenesList, null, 2)}`);

            return this.capitalizeKeysDeep(scenesList);
        } catch (error) {
            throw new Error(`Check scenes list error: ${error.message}`);
        }
    }

    async checkDevicesList() {
        try {
            const result = { State: false, Status: null, Buildings: {}, Devices: [], Scenes: [] };
            if (this.logDebug) this.emit('debug', 'Scanning for devices');

            const resp = await this.client.get(ApiUrls.Home.Get.Context);
            const userContext = resp.data;
            //if (this.logDebug) this.emit('debug', `User Context: ${JSON.stringify(userContext, null, 2)}`);

            const buildings = userContext.buildings ?? [];
            const guestBuildings = userContext.guestBuildings ?? [];
            const buildingsList = [...buildings, ...guestBuildings];

            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (buildingsList.length === 0) {
                result.Status = 'No buildings found';
                return result;
            }

            const capitalizeKeys = obj => Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v])
            );

            const createDevice = (device, type) => {
                const settingsObject = Object.fromEntries(
                    (device.Settings || []).map(({ name, value }) => [
                        name.charAt(0).toUpperCase() + name.slice(1),
                        this.functions.convertValue(value),
                    ])
                );

                const deviceObject = {
                    ...capitalizeKeys(device.Capabilities || {}),
                    ...settingsObject,
                    DeviceType: type,
                    FirmwareAppVersion: device.ConnectedInterfaceIdentifier,
                    IsConnected: device.IsConnected,
                };

                if (device.FrostProtection) device.FrostProtection = capitalizeKeys(device.FrostProtection);
                if (device.OverheatProtection) device.OverheatProtection = capitalizeKeys(device.OverheatProtection);
                if (device.HolidayMode) device.HolidayMode = capitalizeKeys(device.HolidayMode);
                if (Array.isArray(device.Schedule)) device.Schedule = device.Schedule.map(s => this.capitalizeKeysDeep(s));

                const { Settings, Capabilities, Id, GivenDisplayName, ...rest } = device;

                return {
                    ...rest,
                    Type: type,
                    DeviceID: Id,
                    DeviceName: GivenDisplayName,
                    SerialNumber: Id,
                    Device: deviceObject,
                };
            };

            const devices = buildingsList.flatMap(building => [
                ...(building.airToAirUnits || []).map(d => createDevice(capitalizeKeys(d), 0)),
                ...(building.airToWaterUnits || []).map(d => createDevice(capitalizeKeys(d), 1)),
                ...(building.airToVentilationUnits || []).map(d => createDevice(capitalizeKeys(d), 3)),
            ]);

            if (devices.length === 0) {
                result.Status = 'No devices found';
                return result;
            }

            // Sceny
            let scenes = [];
            try {
                scenes = await this.checkScenesList();
                if (this.logDebug) this.emit('debug', `Found ${scenes.length} scenes`);
            } catch (error) {
                if (this.logError) this.emit('error', `Get scenes error: ${error}`);
            }

            result.State = true;
            result.Status = `Found ${devices.length} devices${scenes.length > 0 ? ` and ${scenes.length} scenes` : ''}`;
            result.Buildings = userContext;
            result.Devices = devices;
            result.Scenes = scenes;

            for (const deviceData of result.Devices) {
                deviceData.Scenes = result.Scenes;
                this.emit(deviceData.DeviceID, 'request', deviceData);
            }

            return result;
        } catch (error) {
            throw new Error(`Check devices list error: ${error.message}`);
        }
    }

    // ── Connect ───────────────────────────────────────────────────────────────

    async connect() {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');

        try {
            const connectInfo = { State: false, Status: '', Account: {}, UseFahrenheit: false };

            const client = this.ensureAuthClient();
            const { verifier: codeVerifier, challenge: codeChallenge } = this.generatePkce();
            const state = crypto.randomBytes(16).toString('base64url');

            // ── Step 1: PAR ──────────────────────────────────────────────────
            if (this.logDebug) this.emit('debug', 'Step 1: PAR request');

            const parResp = await this.pace(() =>
                client.post(
                    `${ApiUrls.Home.AuthBase}/connect/par`,
                    new URLSearchParams({
                        response_type: 'code',
                        state,
                        code_challenge: codeChallenge,
                        code_challenge_method: 'S256',
                        client_id: ApiUrls.Home.OauthClientId,
                        scope: ApiUrls.Home.OauthScopes,
                        redirect_uri: ApiUrls.Home.OauthRedirectUri,
                    }),
                    { headers: { 'User-Agent': ApiUrls.Home.UserAgent } }
                )
            );

            if (parResp.status >= 500) throw new Error(`PAR server error: HTTP ${parResp.status}`);
            if (parResp.status !== 201) throw new Error(`PAR request failed: HTTP ${parResp.status}`);

            const requestUri = parResp.data.request_uri;
            if (this.logDebug) this.emit('debug', `PAR OK: request_uri=${requestUri.slice(0, 50)}...`);

            // ── Step 2: Authorize → Cognito login page ────────────────────────
            if (this.logDebug) this.emit('debug', 'Step 2: Authorize redirect to Cognito');

            const authorizeUrl =
                `${ApiUrls.Home.AuthBase}/connect/authorize` +
                `?client_id=${ApiUrls.Home.OauthClientId}&request_uri=${requestUri}`;

            let authCode = null;
            let cognitoLoginUrl = null;
            let csrfToken = null;

            const authResp = await this.pace(() =>
                client.get(authorizeUrl, {
                    headers: { 'User-Agent': ApiUrls.Home.UserAgent },
                    maxRedirects: 5,
                })
            );

            if (authResp.status >= 500) throw new Error(`Authorize server error: HTTP ${authResp.status}`);

            const finalUrl = authResp.request?.res?.responseUrl ?? authorizeUrl;
            const parsed = new URL(finalUrl);
            const body = typeof authResp.data === 'string'
                ? authResp.data
                : JSON.stringify(authResp.data);

            if (parsed.hostname?.endsWith(ApiUrls.Home.CognitoDomainSuffix) && parsed.pathname.includes('/login')) {
                // Happy path: strona logowania Cognito
                csrfToken = this.extractCsrfToken(body);
                if (!csrfToken) throw new Error('Failed to extract CSRF token from Cognito login page');
                cognitoLoginUrl = finalUrl;
                if (this.logDebug) this.emit('debug', 'Cognito login page OK');
            } else {
                // Fast path: istniejąca sesja — kod dostępny od razu
                const codeMatch = /code=([^&"' ]+)/.exec(finalUrl) || /code=([^&"' ]+)/.exec(body);
                if (codeMatch) {
                    authCode = codeMatch[1];
                    if (this.logDebug) this.emit('debug', 'Existing session detected, got auth code directly');
                } else {
                    const cbMatch = /\/connect\/authorize\/callback\?([^"' ]+)/.exec(body);
                    if (cbMatch) {
                        authCode = await this.followCallbackForCode(client, cbMatch[1]);
                        if (this.logDebug) this.emit('debug', 'Existing session: followed callback for code');
                    } else {
                        throw new Error(`Unexpected auth response: ${finalUrl}`);
                    }
                }
            }

            // Fast-path: pomiń etap logowania
            if (authCode) {
                if (this.logDebug) this.emit('debug', 'Re-login with existing session (skipping credentials)');
                const exchangeRes = await this.exchangeCodeForTokens(client, authCode, codeVerifier);
                return this.buildConnectInfo(connectInfo, exchangeRes);
            }

            // ── Step 3: Wyślij dane logowania do Cognito ──────────────────────
            if (this.logDebug) this.emit('debug', 'Step 3: Submit credentials to Cognito');

            const cognitoHostname = new URL(cognitoLoginUrl).hostname;

            // maxRedirects: 0 — Cognito używa response_mode=form_post.
            // Przechwytujemy 302 zanim axios podąży za nim do IdentityServera (→ 500).
            const credResp = await this.pace(() =>
                client.post(
                    cognitoLoginUrl,
                    new URLSearchParams({
                        _csrf: csrfToken,
                        username: this.user,
                        password: this.passwd,
                        cognitoAsfData: '',
                    }),
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76',
                            'Content-Type': 'application/x-www-form-urlencoded',
                            Origin: `https://${cognitoHostname}`,
                            Referer: cognitoLoginUrl,
                        },
                        maxRedirects: 0,
                    }
                )
            );

            if (this.logDebug) {
                this.emit('debug', `Step 3 response status: ${credResp.status}`);
                this.emit('debug', `Step 3 response location: ${credResp.headers?.location ?? '(none)'}`);
            }

            // status 200 = zostaliśmy na stronie Cognito → złe hasło
            if (credResp.status === 200) throw new Error('Authentication failed: Invalid username or password');
            if (credResp.status >= 500) throw new Error(`Cognito server error: HTTP ${credResp.status}`);

            // ── Step 4: POST do signin-oidc-meu (emulacja form_post z Cognito) ──
            // Cognito normalnie robi POST z code+state w body do IdentityServera.
            // My dostaliśmy 302 z tymi parametrami w query — wysyłamy je jako POST body.
            if (this.logDebug) this.emit('debug', 'Step 4: Follow Cognito → IdentityServer redirect');

            const cognitoRedirectLocation = credResp.headers?.location ?? '';
            if (!cognitoRedirectLocation) throw new Error('No Location header in Cognito response');

            if (this.logDebug) this.emit('debug', `Step 4 location: ${cognitoRedirectLocation}`);

            const signinParsed = new URL(cognitoRedirectLocation);
            const signinBase = `${signinParsed.protocol}//${signinParsed.host}${signinParsed.pathname}`;
            const signinParams = new URLSearchParams(signinParsed.search);

            if (this.logDebug) this.emit('debug', `Step 4 POST to: ${signinBase} params: ${[...signinParams.keys()].join(', ')}`);

            const signinResp = await this.pace(() =>
                client.post(signinBase, signinParams, {
                    headers: {
                        'User-Agent': ApiUrls.Home.UserAgent,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    maxRedirects: 0,
                })
            );

            if (this.logDebug) {
                this.emit('debug', `Step 4 signin status: ${signinResp.status}`);
                this.emit('debug', `Step 4 signin location: ${signinResp.headers?.location ?? '(none)'}`);
            }

            // ── Step 5: Podążaj za łańcuchem redirectów aż do auth code ──────────
            // IdentityServer przekierowuje przez kilka etapów:
            // /ExternalLogin/Callback → /connect/authorize/callback → melcloudhome://
            if (this.logDebug) this.emit('debug', 'Step 5: Following redirect chain to auth code');

            let currentResp = signinResp;
            const MAX_HOPS = 6;

            for (let hop = 0; hop < MAX_HOPS; hop++) {
                const hopStatus = currentResp.status;
                const hopLocation = currentResp.headers?.location ?? '';
                const hopBody = typeof currentResp.data === 'string' ? currentResp.data : '';

                if (this.logDebug) this.emit('debug', `Step 5 hop ${hop}: status=${hopStatus} location=${hopLocation || '(none)'}`);

                // A: melcloudhome:// z code=
                if (hopLocation.startsWith('melcloudhome://')) {
                    const m = /code=([^&"' ]+)/.exec(hopLocation);
                    if (m) { authCode = m[1]; break; }
                }

                // B: /connect/authorize/callback w location lub body
                const cbMatch = /\/connect\/authorize\/callback\?([^"' ]+)/.exec(hopLocation)
                    || /\/connect\/authorize\/callback\?([^"' ]+)/.exec(hopBody);
                if (cbMatch) {
                    if (this.logDebug) this.emit('debug', 'Step 5: delegating to followCallbackForCode');
                    authCode = await this.followCallbackForCode(client, cbMatch[1]);
                    break;
                }

                // C: code= bezpośrednio w location
                const codeInLocation = /code=([^&"' ]+)/.exec(hopLocation);
                if (codeInLocation) { authCode = codeInLocation[1]; break; }

                // D: code= w body
                const codeInBody = /code=([^&"' ]+)/.exec(hopBody);
                if (codeInBody) { authCode = codeInBody[1]; break; }

                // Zwykły redirect — podążaj dalej
                if ((hopStatus === 301 || hopStatus === 302 || hopStatus === 303) && hopLocation) {
                    const nextUrl = hopLocation.startsWith('http')
                        ? hopLocation
                        : `${ApiUrls.Home.AuthBase}${hopLocation}`;

                    currentResp = await this.pace(() =>
                        client.get(nextUrl, {
                            headers: { 'User-Agent': ApiUrls.Home.UserAgent },
                            maxRedirects: 0,
                        })
                    );
                    continue;
                }

                throw new Error(`Unexpected response in redirect chain: status=${hopStatus}, location=${hopLocation}`);
            }

            if (!authCode) throw new Error('Failed to extract auth code after redirect chain');

            if (this.logDebug) this.emit('debug', `Got auth code: ${authCode.slice(0, 20)}...`);

            // ── Step 6: Wymień kod na tokeny ──────────────────────────────────
            const exchangeRes = await this.exchangeCodeForTokens(client, authCode, codeVerifier);
            return this.buildConnectInfo(connectInfo, exchangeRes);

        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }
}

export default MelCloudHome;