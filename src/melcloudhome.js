import axios from 'axios';
import http from 'http';
import https from 'https';
import WebSocket from 'ws';
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
        this.logSuccess = account.log?.success;
        this.logInfo = account.log?.info;
        this.logWarn = account.log?.warn;
        this.logError = account.log?.error;
        this.logDebug = account.log?.debug;
        this.pluginStart = pluginStart;

        this.functions = new Functions(this.logWarn, this.logError, this.logDebug)
            .on('warn', warn => this.emit('warn', warn))
            .on('error', error => this.emit('error', error))
            .on('debug', debug => this.emit('debug', debug));

        this.pacer = new RequestPacer();

        // Axios clients
        this.authClient = null; // cookie-jar client used only during the auth flow
        this.client = null; // API client used for all post-login requests

        // Token state
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = 0; // Unix timestamp (seconds)

        // Flag preventing duplicate interceptor registration on re-login
        this.interceptorsAttached = false;

        // WebSocket state
        this.socket = null;
        this.socketConnected = false;
        this.connecting = false;
        this.heartbeat = null;
        this.reconnectTimer = null;
        this.reconnectDelay = 5_000;   // ms, grows exponentially up to reconnectDelayMax
        this.reconnectDelayMax = 300_000; // 5 minutes

        if (pluginStart) {
            this.impulseGenerator = new ImpulseGenerator()
                .on('checkDevicesList', async () => {
                    await this.checkDevicesListWithRetry();
                })
                .on('state', (state) => {
                    this.emit(state ? 'success' : 'warn', `Impulse generator ${state ? 'started' : 'stopped'}`);
                });
        }
    }

    // ── WebSocket ─────────────────────────────────────────────────────────────

    // Resets all WebSocket state and clears the heartbeat interval.
    cleanupSocket() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        this.socket = null;
        this.socketConnected = false;
        this.connecting = false;
    }

    // Opens a WebSocket connection using the user ID from /api/user/context as the hash.
    // Called automatically after a successful login and on every reconnect attempt.
    async connectSocket() {
        if (this.connecting || this.socketConnected) return;
        this.connecting = true;

        let hash;
        try {
            const resp = await this.client.get(ApiUrls.Home.Get.Context);
            hash = resp.data?.id ?? null;
            if (!hash) throw new Error('id field missing in context response');
        } catch (err) {
            if (this.logError) this.emit('error', `WebSocket: cannot get hash: ${err.message}`);
            this.connecting = false;
            this.scheduleReconnect();
            return;
        }

        const url = `${ApiUrls.Home.WebSocket}${hash}`;
        const headers = {
            Origin: ApiUrls.Home.Base,
            Pragma: 'no-cache',
            'Cache-Control': 'no-cache',
        };

        if (this.logDebug) this.emit('debug', `WebSocket connecting: ${url.slice(0, 60)}...`);

        try {
            const ws = new WebSocket(url, { headers });
            this.socket = ws;

            ws.on('error', (error) => {
                if (this.logError) this.emit('error', `WebSocket error: ${error.message}`);
                try { ws.close(); } catch { /* ignore if already closed */ }
            });

            ws.on('close', () => {
                if (this.logDebug) this.emit('debug', 'WebSocket closed');
                this.cleanupSocket();
                this.scheduleReconnect();
            });

            ws.on('open', () => {
                this.socketConnected = true;
                this.connecting = false;
                this.reconnectDelay = 5_000; // reset backoff on successful connection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                if (this.logSuccess && this.pluginStart) this.emit('success', 'WebSocket connected');

                // Send a ping every 30 s to keep the connection alive
                this.heartbeat = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        if (this.logDebug) this.emit('debug', 'WebSocket heartbeat sent');
                        ws.ping();
                    }
                }, 30_000);
            });

            ws.on('pong', () => {
                if (this.logDebug) this.emit('debug', 'WebSocket heartbeat received');
            });

            ws.on('message', (message) => {
                try {
                    const parsed = JSON.parse(message);
                    const messageData = parsed?.[0]?.Data;

                    if (this.logDebug) this.emit('debug', `WebSocket message: ${JSON.stringify(parsed, null, 2)}`);

                    // Ignore empty payloads and server-side auth errors
                    if (!messageData || parsed.message === 'Forbidden') return;

                    this.emit(messageData.id, 'ws', parsed[0]);
                } catch (err) {
                    if (this.logError) this.emit('error', `WebSocket message parse error: ${err.message}`);
                }
            });

        } catch (error) {
            if (this.logError) this.emit('error', `WebSocket connection failed: ${error.message}`);
            this.cleanupSocket();
            this.scheduleReconnect();
        }
    }

    // Schedules a reconnect attempt using exponential backoff (5 s → 10 s → … → 5 min).
    scheduleReconnect() {
        if (this.reconnectTimer) return; // already scheduled

        if (this.logDebug) this.emit('debug', `WebSocket reconnecting in ${this.reconnectDelay / 1000} s...`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connectSocket();
        }, this.reconnectDelay);

        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectDelayMax);
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    // Recursively capitalizes the first letter of every object key.
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

    // Returns true when the access token is absent or expires within 60 seconds.
    isTokenExpired() {
        if (!this.accessToken) return true;
        return Date.now() / 1000 >= this.tokenExpiry - 60;
    }

    // ── Axios clients ─────────────────────────────────────────────────────────

    // Returns (creating if needed) the cookie-jar client used during the OAuth flow.
    ensureAuthClient() {
        if (this.authClient) return this.authClient;

        const jar = new CookieJar();
        this.authClient = wrapper(
            axios.create({
                jar,
                timeout: 30_000,
                headers: {
                    Accept: 'application/json',
                    'User-Agent': ApiUrls.Home.UserAgent,
                },
                maxRedirects: 5,
                validateStatus: () => true, // handle all status codes manually
            })
        );

        return this.authClient;
    }

    // Returns (creating if needed) the API client used for all post-login requests.
    // Uses a keepAlive agent with a short socket timeout to prevent stale connections
    // from causing indefinite hangs after server-side idle timeouts (~5 h symptom).
    ensureClient() {
        if (this.client) return this.client;

        // keepAlive reuses TCP connections; freeSocketTimeout closes idle sockets
        // before the server silently drops them (typically after a few minutes).
        const agentOptions = { keepAlive: true, freeSocketTimeout: 30_000 };

        this.client = axios.create({
            baseURL: ApiUrls.Home.Base,
            timeout: 30_000,
            headers: {
                Accept: 'application/json',
                'User-Agent': ApiUrls.Home.UserAgent,
            },
            httpAgent: new http.Agent(agentOptions),
            httpsAgent: new https.Agent(agentOptions),
        });

        return this.client;
    }

    // ── Pacer ─────────────────────────────────────────────────────────────────

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

    // Extracts the _csrf token value from the Cognito login page HTML.
    extractCsrfToken(html) {
        return (
            /<input[^>]+name="_csrf"[^>]+value="([^"]+)"/.exec(html)?.[1] ??
            /<input[^>]+value="([^"]+)"[^>]+name="_csrf"/.exec(html)?.[1] ??
            /name="_csrf"\s+value="([^"]+)"/.exec(html)?.[1] ??
            null
        );
    }

    // ── OAuth helpers ─────────────────────────────────────────────────────────

    // Follows the /connect/authorize/callback redirect chain and returns the auth code.
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

        if (!location || location === '/') throw new Error('Callback returned empty or root redirect');

        // One additional hop if needed
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

    // Exchanges an authorization code for access and refresh tokens.
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

    // Uses the stored refresh token to obtain a new access token.
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

    // Attempts a token refresh; falls back to a full re-login if the refresh token is
    // missing or rejected. A single shared Promise prevents concurrent refresh races.
    async refreshOrRelogin() {
        if (this.refreshPromise) return this.refreshPromise;

        this.refreshPromise = (async () => {
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
        })().finally(() => {
            this.refreshPromise = null;
        });

        return this.refreshPromise;
    }

    // ── Token interceptors ────────────────────────────────────────────────────

    // Attaches request and response interceptors to the API client.
    // Safe to call multiple times — interceptors are registered only once.
    attachTokenInterceptors() {
        if (this.interceptorsAttached) return;
        this.interceptorsAttached = true;

        const apiClient = this.ensureClient();

        // Inject a fresh Authorization header before every request.
        // If the token is expired, refresh it first.
        apiClient.interceptors.request.use(async (config) => {
            if (this.isTokenExpired()) {
                if (this.logDebug) this.emit('debug', 'Token expired — refreshing before request');
                await this.refreshOrRelogin();
            }
            config.headers['Authorization'] = `Bearer ${this.accessToken}`;
            return config;
        });

        // On 401, refresh the token and retry the original request exactly once.
        apiClient.interceptors.response.use(
            response => response,
            async (error) => {
                const original = error.config;

                if (error.response?.status === 401 && !original.retried) {
                    original.retried = true;
                    if (this.logDebug) this.emit('debug', 'Got 401 — refreshing token and retrying');

                    try {
                        await this.refreshOrRelogin();
                        original.headers['Authorization'] = `Bearer ${this.accessToken}`;
                        return apiClient(original);
                    } catch (refreshError) {
                        this.emit('error', `Token refresh failed: ${refreshError.message}`);
                        return Promise.reject(refreshError);
                    }
                }

                return Promise.reject(error);
            }
        );
    }

    // ── Post-login setup ──────────────────────────────────────────────────────

    // Finalises the connect flow: sets up the API client, attaches interceptors,
    // emits the 'client' event and opens the WebSocket connection.
    async buildConnectInfo(connectInfo, exchangeRes) {
        if (exchangeRes) {
            this.ensureClient();
            this.attachTokenInterceptors();

            if (this.pluginStart) {
                this.emit('client', this.client);
                await this.connectSocket().catch(err => {
                    if (this.logError) this.emit('error', `WebSocket initial connect failed: ${err.message}`);
                });
            }
        }

        connectInfo.State = exchangeRes;
        connectInfo.Status = exchangeRes ? 'Connect Success' : 'Connect Failed';

        return connectInfo;
    }

    // ── Connect ───────────────────────────────────────────────────────────────

    // Full OAuth 2.0 PKCE login flow:
    //   Step 1 — Pushed Authorization Request (PAR)
    //   Step 2 — Authorize redirect → Cognito login page (or fast-path if session exists)
    //   Step 3 — POST credentials to Cognito (maxRedirects: 0 to intercept form_post)
    //   Step 4 — POST Cognito callback params to IdentityServer /signin-oidc-meu
    //   Step 5 — Follow redirect chain until the auth code is found
    //   Step 6 — Exchange auth code for access + refresh tokens
    async connect() {
        if (this.logDebug) this.emit('debug', 'Connecting to MELCloud Home');

        try {
            const connectInfo = { State: false, Status: '', Account: {}, UseFahrenheit: false };
            const client = this.ensureAuthClient();
            const { verifier: codeVerifier, challenge: codeChallenge } = this.generatePkce();
            const state = crypto.randomBytes(16).toString('base64url');

            // ── Step 1: PAR ───────────────────────────────────────────────────
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
            const body = typeof authResp.data === 'string' ? authResp.data : JSON.stringify(authResp.data);

            if (parsed.hostname?.endsWith(ApiUrls.Home.CognitoDomainSuffix) && parsed.pathname.includes('/login')) {
                // Happy path: landed on the Cognito login page
                csrfToken = this.extractCsrfToken(body);
                if (!csrfToken) throw new Error('Failed to extract CSRF token from Cognito login page');
                cognitoLoginUrl = finalUrl;
                if (this.logDebug) this.emit('debug', 'Cognito login page OK');
            } else {
                // Fast path: existing IdentityServer session — auth code available immediately
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

            // Skip credential submission when we already have a code
            if (authCode) {
                if (this.logDebug) this.emit('debug', 'Re-login with existing session (skipping credentials)');
                const exchangeRes = await this.exchangeCodeForTokens(client, authCode, codeVerifier);
                return await this.buildConnectInfo(connectInfo, exchangeRes);
            }

            // ── Step 3: Submit credentials to Cognito ─────────────────────────
            // maxRedirects: 0 — Cognito uses response_mode=form_post, so after a
            // successful login it POSTs back to IdentityServer (/signin-oidc-meu).
            // We intercept the 302 before axios follows it to avoid a 500 from Kestrel.
            if (this.logDebug) this.emit('debug', 'Step 3: Submit credentials to Cognito');

            const cognitoHostname = new URL(cognitoLoginUrl).hostname;

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

            // HTTP 200 means Cognito returned the login page again → wrong password
            if (credResp.status === 200) throw new Error('Authentication failed: Invalid username or password');
            if (credResp.status >= 500) throw new Error(`Cognito server error: HTTP ${credResp.status}`);

            // ── Step 4: POST Cognito callback params to IdentityServer ─────────
            // Cognito normally POSTs code+state to /signin-oidc-meu (form_post).
            // We received a 302 with those params in the query string, so we replay
            // them as a POST body — exactly as Cognito would have done.
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

            // ── Step 5: Follow redirect chain until the auth code is found ────
            // IdentityServer redirects through several hops:
            //   /ExternalLogin/Callback → /connect/authorize/callback → melcloudhome://
            if (this.logDebug) this.emit('debug', 'Step 5: Following redirect chain to auth code');

            let currentResp = signinResp;
            const MAX_HOPS = 6;

            for (let hop = 0; hop < MAX_HOPS; hop++) {
                const hopStatus = currentResp.status;
                const hopLocation = currentResp.headers?.location ?? '';
                const hopBody = typeof currentResp.data === 'string' ? currentResp.data : '';

                if (this.logDebug) this.emit('debug', `Step 5 hop ${hop}: status=${hopStatus} location=${hopLocation || '(none)'}`);

                // A: custom scheme redirect carrying the auth code
                if (hopLocation.startsWith('melcloudhome://')) {
                    const m = /code=([^&"' ]+)/.exec(hopLocation);
                    if (m) { authCode = m[1]; break; }
                }

                // B: IdentityServer authorize callback — delegate to helper
                const cbMatch = /\/connect\/authorize\/callback\?([^"' ]+)/.exec(hopLocation)
                    || /\/connect\/authorize\/callback\?([^"' ]+)/.exec(hopBody);
                if (cbMatch) {
                    if (this.logDebug) this.emit('debug', 'Step 5: delegating to followCallbackForCode');
                    authCode = await this.followCallbackForCode(client, cbMatch[1]);
                    break;
                }

                // C: auth code directly in the Location header
                const codeInLocation = /code=([^&"' ]+)/.exec(hopLocation);
                if (codeInLocation) { authCode = codeInLocation[1]; break; }

                // D: auth code in the response body
                const codeInBody = /code=([^&"' ]+)/.exec(hopBody);
                if (codeInBody) { authCode = codeInBody[1]; break; }

                // Standard redirect — follow the next hop
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

            // ── Step 6: Exchange auth code for tokens ─────────────────────────
            const exchangeRes = await this.exchangeCodeForTokens(client, authCode, codeVerifier);
            return await this.buildConnectInfo(connectInfo, exchangeRes);

        } catch (error) {
            throw new Error(`Connect error: ${error.message}`);
        }
    }

    // ── Scenes ────────────────────────────────────────────────────────────────

    async checkScenesList() {
        try {
            if (this.logDebug) this.emit('debug', 'Scanning for scenes');

            const resp = await this.client.get(ApiUrls.Home.Get.Scenes);
            if (this.logDebug) this.emit('debug', `Scenes: ${JSON.stringify(resp.data, null, 2)}`);

            return this.capitalizeKeysDeep(resp.data);
        } catch (error) {
            throw new Error(`Check scenes list error: ${error.message}`);
        }
    }

    // ── Devices ───────────────────────────────────────────────────────────────

    // Wraps checkDevicesList with a single retry on timeout or network error.
    // Prevents the plugin from restarting when a stale TCP socket causes a one-off hang.
    async checkDevicesListWithRetry() {
        try {
            return await this.checkDevicesList();
        } catch (error) {
            const isRetryable = error.message.includes('timeout') || error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED') || error.message.includes('socket hang up');

            if (isRetryable) {
                if (this.logWarn) this.emit('warn', `checkDevicesList failed (${error.message}) — retrying once`);
                await new Promise(resolve => setTimeout(resolve, 3_000));
                return await this.checkDevicesList();
            }

            throw error;
        }
    }

    async checkDevicesList() {
        try {
            const result = { State: false, Status: null, Buildings: {}, Devices: [], Scenes: [] };
            if (this.logDebug) this.emit('debug', 'Scanning for devices');

            const resp = await this.client.get(ApiUrls.Home.Get.Context);
            const userContext = resp.data;

            const buildingsList = [
                ...(userContext.buildings ?? []),
                ...(userContext.guestBuildings ?? []),
            ];

            if (this.logDebug) this.emit('debug', `Buildings: ${JSON.stringify(buildingsList, null, 2)}`);

            if (buildingsList.length === 0) {
                result.Status = 'No buildings found';
                return result;
            }

            // Shallow capitalize — used for flat objects (Capabilities, FrostProtection, etc.)
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
                if (Array.isArray(device.Schedule)) {
                    device.Schedule = device.Schedule.map(s => this.capitalizeKeysDeep(s));
                }

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

            let scenes = [];
            try {
                scenes = await this.checkScenesList();
                if (this.logDebug) this.emit('debug', `Found ${scenes.length} scenes`);
            } catch (error) {
                if (this.logError) this.emit('error', `Get scenes error: ${error.message}`);
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
}

export default MelCloudHome;