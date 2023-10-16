/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, beforeAll, afterAll, it, expect, Phoenix, awaitsFor */

define(function (require, exports, module) {
    // Load dependent modules
    const WorkerComm = require("worker/WorkerComm"),
        EventDispatcher = require("utils/EventDispatcher"),
        ExtensionUtils = require("utils/ExtensionUtils");

    EventDispatcher.makeEventDispatcher(exports);
    let _myWorker;

    describe("WorkerComm", function () {

        beforeAll(async function () {
            let workerCommUrl = `${Phoenix.baseURL}../src/worker/WorkerComm.js`;
            let eventDispatcherURL = `${Phoenix.baseURL}../src/utils/EventDispatcher.js`;
            let workerPath = ExtensionUtils.getModulePath(module, "WorkerComm-worker.js");
            _myWorker = new Worker(
                `${workerPath}?workerCommUrl=${workerCommUrl}&eventDispatcherURL=${eventDispatcherURL}`);
            WorkerComm.createWorkerComm(_myWorker, exports);
            let initDone = false;
            exports.on(WorkerComm.EVENT_WORKER_COMM_INIT_COMPLETE, ()=>{
                initDone = true;
            });
            await awaitsFor(function () {
                return initDone;
            }, "waiting for worker to load WorkerComm");
        });

        afterAll(function () {
            _myWorker.terminate();
        });

        describe("execPeer API tests", function () {
            it("Should exec a function in worker normal return", async function () {
                let result = await exports.execPeer("echoNoPromise", "yo");
                expect(result).toBe("yo");
            });

            it("Should exec a function in worker and resolve promise return", async function () {
                let result = await exports.execPeer("echoNoPromise", "promised");
                expect(result).toBe("promised");
            });

            it("Should throw if thrown in worker", async function () {
                let thrown;
                try{
                    await exports.execPeer("throwingNoPromise");
                } catch (e) {
                    thrown = e;
                }
                expect(thrown.message).toBe("oops");
            });

            it("Should throw if promise rejected in worker", async function () {
                let thrown;
                try{
                    await exports.execPeer("rejectPromise");
                } catch (e) {
                    thrown = e;
                }
                expect(thrown).toBe("nono");
            });

            it("Should worker be able to exec function in main thread", async function () {
                exports.setExecHandler("mainSayHi", function () {
                    return "hi main";
                });
                let result = await exports.execPeer("execInMainThread");
                expect(result).toBe("hi main");
            });

            it("Should worker catch if main thread exec function throws", async function () {
                exports.setExecHandler("mainThrow", function () {
                    throw new Error("throw_me");
                });
                let result = await exports.execPeer("execAndRejectInMainThread");
                expect(result.message).toBe("throw_me");
            });
        });

        describe("triggerPeer API tests", function () {
            it("Should trigger notification in worker and main thread", async function () {
                let echoVal;
                exports.on('echoNotify1', (evt, val)=>{
                    echoVal = val;
                });
                exports.triggerPeer("echoNotify1", "yo1");
                await awaitsFor(function () {
                    return echoVal === "yo1";
                }, "waiting for worker to notify main");
            });

            it("Should trigger notification in worker and main thread even if some handlers errored", async function () {
                let echoVal;
                exports.on('echoNotify2', (evt, val)=>{
                    echoVal = val;
                });

                exports.triggerPeer("echoNotify2", "yo2");
                await awaitsFor(function () {
                    return echoVal === "yo2";
                }, "waiting for worker to notify main");

                // check if the notification works again after error in worker
                echoVal = "";
                exports.triggerPeer("echoNotify2", "yo2");
                await awaitsFor(function () {
                    return echoVal === "yo2";
                }, "waiting for worker to notify main");
            });
        });

        describe("loadScriptInWorker API tests", function () {
            it("Should be able to load a script in worker", async function () {
                await exports.loadScriptInWorker('./WorkerComm-worker-script.js');
                let result = await exports.execPeer("scriptHi", "scriptInjected");
                expect(result).toBe("scriptInjected");
            });

        });
    });
});
