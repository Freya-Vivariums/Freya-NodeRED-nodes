/*
 *  Temperature Controller
 *  P-Controller with open-loop support
 *
 *  Copyright (c) 2025 Sanne 'SpuQ' Santens.
 *  Licensed under the MIT License. See the project's LICENSE file for details.
 */

const EventEmitter = require('events');

class TemperatureController extends EventEmitter {
    /**
     * constructor()
     * Initializes control parameters, operation mode, and watchdog timer.
     * @constructor
     */
    constructor() {
        super();

        this.targetTemperature = 0;         // Desired temperature setpoint (°C)
        this.currentTemperature = 0;        // Latest measured temperature (°C)
        this.proportionalGain =10;          // Proportional gain constant
        this.controlEffort = 0;             // Control effort output in range [-100, +100]

        this.isOpenLoop = true;             // Flag: true when running without sensor feedback (open-loop)
        this.controlLoopTimer = null;       // Interval handle for periodic control loop
        this.watchdogTimer = null;          // Timeout handle for sensor-update watchdog

        this._startWatchdog();
        this.emitStatus('error',
                        'Open-loop mode',
                        'No sensor feedback — controller running without environmental feedback');
    }

    /**
     * _startWatchdog()
     * Starts or restarts the watchdog timer.
     * When a sensor update occurs, resets the timer and disables open-loop mode.
     * If no update arrives within 3 minutes, enables open-loop mode.
     * @private
     * @returns {void}
     */
    _startWatchdog() {
        if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
        this.setOpenLoopEnabled(false);
        this.watchdogTimer = setTimeout(() => {
            this.setOpenLoopEnabled(true);
        }, 3 * 60 * 1000);
    }

    /**
     * clear()
     * Stops the control loop and watchdog, resets control effort, and emits an open-loop status.
     * @returns {void}
     */
    clear() {
        if (this.controlLoopTimer) clearInterval(this.controlLoopTimer);
        if (this.watchdogTimer)    clearTimeout(this.watchdogTimer);
        this.controlEffort = 0;
        this.emitStatus('error',
                        'Open-loop mode',
                        'Controller inactive — running without environmental feedback');
    }

    /**
     * updateTemperature(temperature)
     * Updates the current temperature reading and restarts the watchdog timer.
     * @param {number} temperature - The latest temperature measurement (°C).
     * @returns {void}
     */
    updateTemperature(temperature) {
        this.currentTemperature = temperature;
        this._startWatchdog();
    }

    /**
     * getCurrentReading()
     * Retrieves the current control state.
     * @returns {{ targetTemperature: number, currentTemperature: number, timestamp: number }}
     *   An object containing the target setpoint, current temperature, and UNIX timestamp.
     */
    getCurrentReading() {
        return {
            targetTemperature:  this.targetTemperature,
            currentTemperature: this.currentTemperature,
            timestamp:          Math.floor(Date.now() / 1000)
        };
    }

    /**
     * configure(targetTemperature, proportionalGain)
     * Configures the controller's setpoint and gain, and starts the periodic control loop.
     * @param {number} targetTemperature - Desired temperature setpoint (°C).
     * @param {number} [proportionalGain=10] - Proportional gain constant (Kp).
     * @returns {void}
     */
    configure(targetTemperature, proportionalGain = 10) {
        this.targetTemperature = targetTemperature;
        this.proportionalGain   = proportionalGain;

        if (this.controlLoopTimer) clearInterval(this.controlLoopTimer);
        this.controlLoopTimer = setInterval(() => this._executeControlLoop(), 2000);

        this.emitStatus('ok',
                        'Controller configured',
                        `Setpoint=${this.targetTemperature}°C, Kp=${this.proportionalGain}`);
    }

    /**
     * setOpenLoopEnabled(enabled)
     * Enables or disables open-loop mode.
     * @param {boolean} enabled - True to run without sensor feedback; false to use feedback.
     * @returns {void}
     */
    setOpenLoopEnabled(enabled) {
        this.isOpenLoop = enabled;
    }

    /**
     * emitStatus(level, message, details)
     * Emits a status event describing the controller's state.
     * @param {string} level - Severity level ('ok', 'error', etc.).
     * @param {string} message - Short status message.
     * @param {string} [details] - Additional details or context.
     * @returns {void}
     */
    emitStatus(level, message, details) {
        this.emit('status', { level, message, details });
    }

    /**
     * _executeControlLoop()
     * Executes one iteration of the P-control loop.
     * Calculates control effort based on proportional error and emits output and status.
     * @private
     * @returns {void}
     */
    _executeControlLoop() {
        if (this.isOpenLoop) {
            this.controlEffort = 0;
            this.emitStatus('error',
                            'Open-loop mode',
                            'No sensor feedback — controller running without environmental feedback');
            this.emit('controlOutput', this.controlEffort);
            return;
        }

        const error = this.targetTemperature - this.currentTemperature;
        this.controlEffort = this.proportionalGain * error;

        // Clamp to [-100, +100]
        this.controlEffort = Math.max(-100, Math.min(100, this.controlEffort));

        let statusMessage;
        if (this.controlEffort > 0) {
            statusMessage = `Heating at ${Math.round(this.controlEffort)}% effort`;
        } else if (this.controlEffort < 0) {
            statusMessage = `Cooling at ${Math.round(-this.controlEffort)}% effort`;
        } else {
            statusMessage = 'Idle (on target)';
        }

        this.emitStatus('ok', statusMessage);
        this.emit('controlOutput', this.controlEffort);
    }
}

module.exports = { TemperatureController };
