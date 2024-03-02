"use strict";
const MQTT = require("async-mqtt");
const EventEmitter = require('events');

class MQTTCLIENT extends EventEmitter {
    constructor(config) {
        super();
        this.mqttHost = config.host;
        this.mqttPort = config.port;
        this.mqttClientId = config.clientId;
        this.mqttUser = config.user;
        this.mqttPasswd = config.passwd;
        this.mqttPrefix = config.prefix;
        this.mqttDebug = config.debug;
        this.isConnected = false;

        this.connect();
    };

    async connect() {
        try {
            const options = {
                clientId: this.mqttClientId,
                username: this.mqttUser,
                password: this.mqttPasswd
            }
            const url = `mqtt://${this.mqttHost}:${this.mqttPort}`;
            this.mqttClient = await MQTT.connectAsync(url, options);
            this.isConnected = true;
            this.emit('connected', 'MQTT Connected.');
            this.subscribe();
        } catch (error) {
            this.isConnected = false;
            this.emit('error', `MQTT Connect error: ${error}`);
        };
    };

    async subscribe() {
        try {
            this.mqttClient.on('message', (topic, message) => {
                const data = JSON.parse(message.toString());
                const emitDebug = this.mqttDebug ? this.emit('debug', `MQTT received topic: ${topic}, message: ${JSON.stringify(data, null, 2)}`) : false;
                this.emit('changeState', data);
            });

            const topic = `${this.mqttPrefix}/Set`;
            await this.mqttClient.subscribe(topic);
            const emitDebug = this.mqttDebug ? this.emit('connected', `MQTT subscribe topic: ${topic}.`) : false;
        } catch (error) {
            this.emit('error', `MQTT Subscribe error: ${error}`);
        };
    };

    async send(topic, message) {
        if (!this.isConnected) {
            const emitDebug = this.mqttDebug ? this.emit('debug', `MQTT client not connected.`) : false;
            return
        };

        try {
            const fullTopic = `${this.mqttPrefix}/${topic}`;
            const publishMessage = JSON.stringify(message, null, 2);
            await this.mqttClient.publish(fullTopic, publishMessage);
            const emitDebug = this.mqttDebug ? this.emit('debug', `MQTT publish: ${fullTopic}: ${message}`) : false;
        } catch (error) {
            this.emit('error', `MQTT Publish error: ${error}`);
        };
    };
};
module.exports = MQTTCLIENT;