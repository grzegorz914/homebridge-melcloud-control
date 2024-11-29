"use strict";
import express, { json } from 'express';
import EventEmitter from 'events';

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.restFulPort = config.port;
        this.restFulDebug = config.debug;

        this.restFulData = {
            info: 'This data is not available at this time.',
            state: 'This data is not available at this time.'
        };

        this.connect();
    };

    connect() {
        try {
            const restFul = express();
            restFul.set('json spaces', 2);
            restFul.use(json());
            restFul.get('/info', (req, res) => { res.json(this.restFulData.info) });
            restFul.get('/state', (req, res) => { res.json(this.restFulData.state) });

            //post data
            restFul.post('/', (req, res) => {
                try {
                    const obj = req.body;
                    const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul post data: ${JSON.stringify(obj, null, 2)}`) : false;
                    const key = Object.keys(obj)[0];
                    const value = Object.values(obj)[0];
                    this.emit('set', key, value);
                    res.send('OK');
                } catch (error) {
                    this.emit('error', `RESTFul Parse object error: ${error}`);
                };
            });

            restFul.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`)
            });

        } catch (error) {
            this.emit('error', `RESTful Connect error: ${error.message || error}`)
        }
    };

    update(path, data) {
        switch (path) {
            case 'info':
                this.restFulData.info = data;
                break;
            case 'state':
                this.restFulData.state = data;
                break;
            default:
                this.emit('error', `Unknown RESTFul update path: ${path}, data: ${data}`)
                break;
        };
        const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul update path: ${path}, data: ${data}`) : false;
    };
};
export default RestFul;