/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global describe, beforeEach, afterEach, it, expect */

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager = require("command/CommandManager");

    describe("CommandManager", function () {

        var commandID = "commandID";

        var executed;
        var testCommandFn = function () { executed = true; };

        beforeEach(function () {
            executed = false;
            CommandManager._testReset();
        });

        afterEach(function () {
            CommandManager._testRestore();
        });

        it("register and get a command and validate parameters", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            expect(command).toBeTruthy();
            expect(command.getName()).toBe("test command");
            expect(command.getID()).toBe(commandID);
            expect(command.getEnabled()).toBeTruthy();
            expect(command.getChecked()).toBe(undefined);
            expect(command._commandFn).toBe(testCommandFn);

            // duplicate command
            expect(CommandManager.register("test command", commandID, testCommandFn)).toBeFalsy();

            // missing arguments
            expect(CommandManager.register(null, "test-command-id2", testCommandFn)).toBe(null);
            expect(CommandManager.register("test command", null, testCommandFn)).toBe(null);
            expect(CommandManager.register("test command", "test-command-id2", null)).toBe(null);

        });

        it("execute a command", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.execute();
            expect(executed).toBeTruthy();
        });

        it("not execute a disabled command", function () {
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.setEnabled(false);
            command.execute();
            expect(executed).toBeFalsy();
        });

        it("set enabled state and trigger enabledStateChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("enabledStateChange", function () {
                eventTriggered = true;
            });
            command.setEnabled(false);
            expect(eventTriggered).toBeTruthy();
            expect(command.getEnabled()).toBeFalsy();
        });

        it("set checked state and trigger checkedStateChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("checkedStateChange", function () {
                eventTriggered = true;
            });
            command.setChecked(true);
            expect(eventTriggered).toBeTruthy();
            expect(command.getChecked()).toBeTruthy();
        });

        it("rename command trigger nameChange", function () {
            var eventTriggered = false;
            var command = CommandManager.register("test command", commandID, testCommandFn);
            command.on("nameChange", function () {
                eventTriggered = true;
            });
            command.setName("newName");
            expect(eventTriggered).toBeTruthy();
            expect(command.getName()).toBe("newName");
        });
        it("execute a command with optional source event", function () {
            let event = {eventSource: "hello"};
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: true});
            command.execute(event);
            expect(receivedEvent).toBe(event);
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID, event);
            expect(receivedEvent).toBe(event);
        });
        it("execute a command with optional source event and additional exec args", function () {
            let event = {eventSource: "hello"};
            let receivedEvent, receiveArg1, receiveArg2;
            let command = CommandManager.register("test command", commandID, (event, arg1, arg2)=>{
                receivedEvent = event;
                receiveArg1 = arg1;
                receiveArg2 = arg2;
            }, {eventSource: true});
            command.execute(event, 42, "arg2");
            expect(receivedEvent).toBe(event);
            expect(receiveArg1).toBe(42);
            expect(receiveArg2).toBe("arg2");
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID, event, 55, "argx");
            expect(receivedEvent).toBe(event);
            expect(receiveArg1).toBe(55);
            expect(receiveArg2).toBe("argx");
        });
        it("execute a command registered with eventSource should get event even if execute misses the source", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: true});
            command.execute();
            expect(receivedEvent).toEql({ eventSource: 'otherExecAction' });
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).toEql({ eventSource: 'otherExecAction' });
        });
        it("execute a command will not get eventSource if eventSource option set to false", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{
                receivedEvent = event;
            }, {eventSource: false});
            command.execute();
            expect(receivedEvent).not.toBeDefined();
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).not.toBeDefined();
        });
        it("execute a command will not get eventSource if eventSource option not given", function () {
            let receivedEvent;
            let command = CommandManager.register("test command", commandID, (event)=>{receivedEvent = event;});
            command.execute();
            expect(receivedEvent).not.toBeDefined();
            // now do with command manager exec
            receivedEvent = null;
            CommandManager.execute(commandID);
            expect(receivedEvent).not.toBeDefined();
        });
    });
});
