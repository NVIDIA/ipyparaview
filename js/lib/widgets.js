/******************************************************************************
 * Copyright (c) 2019, NVIDIA CORPORATION.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *****************************************************************************/

var widgets = require('@jupyter-widgets/base');
var _ = require('lodash');

var PVDisplayModel = widgets.DOMWidgetModel.extend({
    defaults: _.extend(widgets.DOMWidgetModel.prototype.defaults(), {
        _model_name : 'PVDisplayModel',
        _view_name : 'PVDisplayView',
        _model_module : 'ipyparaview',
        _view_module : 'ipyparaview',
        _model_module_version : '0.1.0',
        _view_module_version : '0.1.0'
    })
});


var PVDisplayView = widgets.DOMWidgetView.extend({
        render: function(){
            //Utility functions
            var norm = function(x){
                return Math.sqrt(x[0]*x[0] + x[1]*x[1] + x[2]*x[2]);
            };

            var normalize = function(x){
                r = norm(x);
                return [ x[0]/r, x[1]/r, x[2]/r ];
            };

            var cross = function(x, y){
                return [ x[1]*y[2] - x[2]*y[1],
                         x[2]*y[0] - x[0]*y[2],
                         x[0]*y[1] - x[1]*y[0] ];
            };

            var cartToSphr = function(x){
                var r = norm(x);
                return [r,
                    Math.atan2(x[0], x[2]),
                    Math.asin(x[1]/r)];
            };

            var sphrToCart = function(x){
                return [ x[0]*Math.sin(x[1])*Math.cos(x[2]),
                         x[0]*Math.sin(x[2]),
                         x[0]*Math.cos(x[1])*Math.cos(x[2]) ];
            };

            var vadd = function(x,y){
                return [ x[0] + y[0], x[1] + y[1], x[2] + y[2] ];
            };
            var vscl = function(x,y){
                return [ x[0]*y, x[1]*y, x[2]*y ];
            };


            this.model.on('change:frame', this.frameChange, this);

            // Create 'div' and 'canvas', and attach them to the...erm, "el"
            this.renderWindow = document.createElement('div');
            this.canvas = document.createElement('canvas');
            this.renderWindow.appendChild(this.canvas);
            this.el.appendChild(this.renderWindow);

            //convenience references
            var canvas = this.canvas;
            var ctx = canvas.getContext('2d');
            var model = this.model;
            var view = this;

            cf = model.get('camf');
            cp = cartToSphr(vadd(model.get('camp'), vscl(cf, -1.0)));
            cu = model.get('camu');

            [canvas.width,canvas.height] = model.get('resolution');

            //Perform the initial render
            let frame = new Uint8Array(this.model.get('frame').buffer);
            var imgData = ctx.createImageData(canvas.width,canvas.height);
            var i;
            for(i=0; i<imgData.data.length; i+=4){
                imgData.data[i+0] = frame[i+0];
                imgData.data[i+1] = frame[i+1];
                imgData.data[i+2] = frame[i+2];
                imgData.data[i+3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            var m0 = {x: 0.0, y: 0.0}; //last mouse position

            //converts mouse from canvas space to NDC
            var getNDC = function(e){
                var rect = canvas.getBoundingClientRect();

                //compute current mouse coords in NDC
                var mx = (e.clientX - rect.left)/(rect.right-rect.left);
                var my = (e.clientY - rect.top)/(rect.top-rect.bottom);

                return {x: mx, y: my};
            };

            var getMouseDelta = function(e){
                var m1 = getNDC(e);
                var md = {x: m1.x-m0.x, y: m1.y-m0.y};
                m0 = m1;
                return md;
            };

            //mouse event throttling--wait throttlems between mouse events
            const throttlems = 1000.0/20.0;
            var lastMouseT = Date.now();
            var updateCam = function(){
                var mt = Date.now();
                if(mt - lastMouseT > throttlems){
                    model.set({"camp": vadd(sphrToCart(cp), cf), "camf": cf});
                    model.save_changes(); //triggers state synchronization (I think)
                    view.send({event: 'updateCam', data: ''}); //trigger a render
                    lastMouseT = mt;
                }
            };


            // Mouse event handling -- drag and scroll
            var handleDrag = function(e){
                const scl = 5.0; //rotation scaling factor
                const phiLim = 1.5175; //limit phi from reaching poles

                var md = getMouseDelta(e);

                cp[1] -= 5.0*md.x;
                cp[2] = Math.max(-phiLim, Math.min(phiLim, cp[2]-5.0*md.y));
                updateCam();
            };

            var handleMidDrag = function(e){
                const scl = 1.0/1.25;

                var md = getMouseDelta(e);

                ccp = sphrToCart(cp);
                h = normalize(cross(ccp, cu)); //horizontal
                v = normalize(cross(ccp,  h)); //vertical
                d = vscl(vadd(vscl(h,md.x), vscl(v,md.y)), cp[0]*scl); //position delta
                cf = vadd(cf, d);
                //NOTE: cp is relative to cf

                updateCam();
            };

            var handleScroll = function(e){
                const wheelScl = 40.0;
                const dScl = 0.05;
                const rlim = 0.00001;

                e.preventDefault();
                e.stopPropagation();
                var d = e.wheelDelta ? e.wheelDelta/wheelScl : e.detail ? -e.detail : 0;
                if(d){
                    cp[0] = Math.max(rlim, cp[0]*(1.0-dScl*d));
                    updateCam();
                }
            };

            // Add event handlers to canvas
            canvas.addEventListener('mousedown',function(e){
                m0 = getNDC(e);
                if(e.button == 0){
                    canvas.addEventListener('mousemove',handleDrag,false);
                }else if(e.button == 1){
                    canvas.addEventListener('mousemove',handleMidDrag,false);
                }
            }, false);

            canvas.addEventListener('mouseup',function(e){
                if(e.button == 0){
                    canvas.removeEventListener('mousemove',handleDrag,false);
                }else if(e.button == 1){
                    canvas.removeEventListener('mousemove',handleMidDrag,false);
                }
            }, false);

            canvas.addEventListener('wheel', handleScroll, false);
    },

    frameChange: function() {
        let ctx = this.canvas.getContext('2d');
        let frame = new Uint8Array(this.model.get('frame').buffer);
        var imgData = ctx.createImageData(this.canvas.width,this.canvas.height);
        var i;
        for(i=0; i<imgData.data.length; i+=4){
            imgData.data[i+0] = frame[i+0];
            imgData.data[i+1] = frame[i+1];
            imgData.data[i+2] = frame[i+2];
            imgData.data[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    },
});

var VStreamModel = widgets.DOMWidgetModel.extend({
    defaults: _.extend(widgets.DOMWidgetModel.prototype.defaults(), {
        _model_name : 'VStreamModel',
        _view_name : 'VStreamView',
        _model_module : 'ipyparaview',
        _view_module : 'ipyparaview',
        _model_module_version : '0.1.0',
        _view_module_version : '0.1.0',
        url : 'ws://example.com',
    })
});

var VStreamView = widgets.DOMWidgetView.extend({
    sourceBuffer : {},
    videosocket : {},
    mouseDown : [false, false, false],
    bufArray : new Array(),
    arraySize : 0,
    frame : -1,
    timeAtLastFrame : -1,
    mostRecentFrame : {},
    mediaSource : {},
    video : document.createElement('video'),
    vframe : {},
    mouse_x : {},
    mouse_y : {},
    url : {},
    width : 512,
    height : 512,

    render: function() {
        this.url_changed();
        this.model.on('change:url', this.url_changed, this);

        this.mediaSource = new MediaSource();

        this.construct_ui();
        this.attach_listeners();
    },

    construct_ui : function() {
        this.stream_area = document.createElement('div');
        this.stream_area.id="stream_area";
        this.el.appendChild(this.stream_area);
        //this.el.parentNode.height = "512";

        var button_area = document.createElement('div');
        this.stream_area.appendChild(button_area);

        var that = this;

        var cbutton = document.createElement('input');
        cbutton.id = 'connect';
        cbutton.type = 'button';
        cbutton.value = 'Connect';
        cbutton.addEventListener('click', function(){that.connectToServer();});
        button_area.appendChild(cbutton);

        var dbutton = document.createElement('input');
        dbutton.id = 'disconnect';
        dbutton.type = 'button';
        dbutton.value = 'Disconnect';
        dbutton.addEventListener('click', function(){that.disconnect();});
        button_area.appendChild(dbutton);
        this.stream_area.appendChild(document.createElement('p'));

        this.vframe = document.createElement('div');
        this.vframe.id = "videoframe";
        this.vframe.setAttribute("tabindex","0");
        this.vframe.width = this.width;
        this.vframe.height = this.height;
        this.vframe.addEventListener('mousemove',  function(event){that.mouseMoveHandler(event);});
        this.vframe.addEventListener('mouseout',   function(event){that.mouseOutHandler(event);});
        this.vframe.addEventListener('mousedown',  function(event){that.mouseDownHandler(event); });
        this.vframe.addEventListener('contextmenu',function(event){that.contextMenuHandler(event); });
        this.vframe.addEventListener('mouseup',    function(event){that.mouseUpHandler(event);});
        this.vframe.addEventListener('mousewheel', function(event){that.mouseWheelHandler(event);});
        this.vframe.addEventListener("keydown",    function(event){that.keyDownHandler(event);});
        this.vframe.addEventListener("keyup",      function(event){that.keyUpHandler(event);});
        this.vframe.addEventListener("keypress",   function(event){that.keyPressHandler(event);});
        window.addEventListener("resize",     function(event){that.resizeHandler(event);});
        this.stream_area.appendChild(this.vframe);

        this.video.id = "video";
        //this.video.width = "auto";
        //this.video.height = "auto";
        this.video.width = this.width;
        this.video.height = this.height;
        this.video.autoplay = false;
        this.video.src = window.URL.createObjectURL(this.mediaSource);
        this.vframe.appendChild(this.video);

    },

    attach_listeners : function(){
        //'this' pointer does not point to this object when invoked as a callback
        //https://stackoverflow.com/a/134149
        //because of this peculiarity, we cannot use object methods as callbacks
        //if they need access to 'this'.
        var that = this;

        //var mimecodec = 'video/mp4;codecs="avc1.64001E"';// 'video/mp4; codecs="avc1.42E01E"';
        //var mimecodec = 'video/mp4; codecs="avc1.42E01E"';
        // 0x64=100 "High Profile"; 0x00 No constraints; 0x1F=31 "Level 3.1"
        var mimecodec = 'video/mp4; codecs="avc1.64001F"';

        this.mediaSource.addEventListener('sourceopen', function() {
            console.log("sourceOpen...");
            // get a source buffer to contain video data this we'll receive from the server
            console.log (that.video.canPlayType(mimecodec));
            that.sourceBuffer = that.mediaSource.addSourceBuffer(mimecodec);
        });

        this.mediaSource.addEventListener('webkitsourceopen', function() {
            console.log("webkitsourceopen...");
            // get a source buffer to contain video data this we'll receive from the server
            that.sourceBuffer = that.mediaSource.addSourceBuffer(mimecodec);
            //that.sourceBuffer = that.mediaSource.addSourceBuffer('video/mp4;codecs="avc1.64001E"');
        });
    },

    url_changed: function() {
        this.url = this.model.get('url');
        this.el.textContent = this.url;
    },

    connectToServer : function(){
        if( "WebSocket" in window )
        {
            // var url = get_appropriate_ws_url() + "/index_app";
            var url = this.url; //"ws://localhost:9002";
            console.log("Connecting to: "+url);
            this.videosocket = new WebSocket( url );
            try
            {
                // Register callback functions on the WebSocket
                this.videosocket.binaryType = "arraybuffer";
                var that = this;
                this.videosocket.onopen = function(result){that.onVideoConnectedCallback(result);};
                this.videosocket.onmessage = function(indata){that.decodeAndDisplayVideo(indata);};
                this.videosocket.onerror = function(obj){that.onerror(obj);};
                this.videosocket.onclose = function(obj){that.onVideoClose(obj)};
                console.log("success (?)")
            }
            catch( exception )
            {
                alert('Exception: ' + exception );
            }
        }
        else
        {
            alert("WebSockets NOT supported..");
            return;
        }

        //try
        //{
        //    this.video.play(); //for android devices
        //}
        //catch (exception)
        //{

        //}
    },

    // If the user click on the button "disconnect", close the websocket to the
    // video streaming server.
    disconnect  : function(){
        if (this.video.connected)
        {
            var command = {
                "command": "disconnect"
            }
            this.videosocket.send(JSON.stringify(command));
        }

        this.video.connected = false;
        this.videosocket.close();

        document.getElementById('connect').   disabled = true;
        document.getElementById('disconnect').disabled = false;
    },

    decodeAndDisplayVideo : function( indata ){

        // If the server sends any error message, display it on the console.
        if (typeof indata.data === "string")
            console.log(indata.data);

        var arrayBuffer = indata.data;
        var bs = new Uint8Array( arrayBuffer );
        this.bufArray.push(bs);
        this.arraySize += bs.length;

        if (!this.sourceBuffer.updating)
        {
            var streamBuffer = new Uint8Array(this.arraySize);
            var i=0;
            while (this.bufArray.length > 0)
            {
                var b = this.bufArray.shift();
                streamBuffer.set(b, i);
                i += b.length
            }
            this.arraySize = 0;
            // Add the received data to the source buffer
            this.sourceBuffer.appendBuffer(streamBuffer);
            var logmsg = 'Frame: ' + this.frame
                tnow = performance.now();
            if (this.timeAtLastFrame >= 0)
            {
                var dt = Math.round(tnow - this.timeAtLastFrame);
                logmsg += '; dt = ' + dt + 'ms';
                logmsg += '\n' + Array(Math.round(dt/10)).join('*');
            }
            this.timeAtLastFrame = tnow;

            console.log(logmsg);
        }

        ++this.frame;
        if (this.video.paused)
        {
            this.video.play();
        }
        //TODO: Figure out a smarter way to manage the frame size (i.e. cache it?)
        this.video.width = this.video.videoWidth;
        this.video.height = this.video.videoHeight;
    },


    start : function(){
        document.getElementById('connect').   disabled = true;
        document.getElementById('disconnect').disabled = false;
    },

    // Send a command to the video streaming server
    sendCommand : function (command){
        if (this.video.connected)
        {
            var message = {
                "command": command,
            }
            this.videosocket.send(JSON.stringify(message));
        }
    },

    // The WebSocket connection to the video streaming server has been established.
    // We are now ready to play the video stream.
    onVideoConnectedCallback : function( result ){
        console.log("Connected")

        this.resizeHandler();

        // https://stackoverflow.com/a/40238567
        var playPromise = this.video.play();
        if ( playPromise !== undefined) {
            console.log("Got play promise; waiting for fulfilment...");
            var that = this;
            playPromise.then(function() {
                console.log("Play promise fulfilled! Starting playback.");
                that.video.connected = true;
                that.vframe.width = that.width;
                that.vframe.height = that.height;
                document.getElementById('connect').   disabled = true;
                document.getElementById('disconnect').disabled = false;

                that.start();
                that.video.currentTime = 0;
            }).catch(function(error) {
                console.log("Failed to start playback: "+error);
            });
        }

    },

    // If there is an error on the WebSocket, reset the buttons properly.
    onerror : function( obj ){
        this.video.connected = false;
        document.getElementById('connect').   disabled = true;
        document.getElementById('disconnect').disabled = false;
    },

    // If there the WebSocket is closed, reset the buttons properly.
    onVideoClose : function( obj ){
        this.video.connected = false;
        document.getElementById('connect').   disabled = false;
        document.getElementById('disconnect').disabled = true;

        this.sourceBuffer.remove(0, 10000000);
    },

    // The mouse has moved, we send command "mouse_move" to the video streaming server.
    mouseMoveHandler : function(event){
        //console.log("mousemove "+event.button);
        if (this.video.connected)// && this.mouseDown.some( function(val){ return val } ))
        {
            //this.mouse_x += event.movementX;
            //this.mouse_y += event.movementY;
            this.mouse_x = event.offsetX;
            this.mouse_y = event.offsetY;

            var command = {
                "command": "mouse_move",
                "mouse_move" : {
                    "button": event.button,
                    //"mouse_x": event.clientX,
                    //"mouse_y": event.clientY,
                    "x": this.mouse_x,
                    "y": this.mouse_y
                }
            };
            this.videosocket.send(JSON.stringify(command));
            //console.log(command);
        }
        else
        {
            this.mouse_x = event.offsetX;
            this.mouse_y = event.offsetY;
        }
    },

    // The mouse has moved out of the window image, this is equivalent to an event
    // in which the user releases the mouse button
    mouseOutHandler : function (event){
        this.mouseDown[event.button] = false;
    },

    // The user has pressed a mouse button, we send command "mouse_down" to
    // the video streaming server.
    mouseDownHandler : function (event){
        console.log("mousedown "+event.button);
        //event.preventDefault();
        //event.stopPropagation();
        //this.video.focus();
        this.mouseDown[event.button] = true;
        this.mouse_x = event.offsetY;
        this.mouse_y = event.offsetX;
        if (this.video.connected)
        {
            var command = {
                "command" : "mouse_down",
                "mouse_down" : {
                    "button": event.button,
                    //"mouse_x": event.clientX,
                    //"mouse_y": event.clientY,
                    "x": this.mouse_x,
                    "y": this.mouse_y
                }
            };
            this.videosocket.send(JSON.stringify(command));
            //this.vframe.requestPointerLock();
            return false;
        }
    },

    // The user has released a mouse button, we send command "mouse_up" to the
    // video streaming server.
    mouseUpHandler : function (event){
        console.log("mouseup "+event.button);
        event.preventDefault();
        //event.stopPropagation();
        //this.video.focus();
        this.mouseDown[event.button] = false;
        if (this.video.connected)
        {
            var command = {
                "command" : "mouse_up",
                "mouse_up": {
                    "button": event.button,
                    //"mouse_x": event.clientX,
                    //"mouse_y": event.clientY,
                    "x": this.mouse_x,
                    "y": this.mouse_y
                }
            };
            this.videosocket.send(JSON.stringify(command));
            //document.exitPointerLock();
            return false;
        }
    },

    // mouse wheel input
    mouseWheelHandler : function (event){
        var delta = 0;
        if (event.wheelDelta >= 120)
        {
            delta = 1;
        }
        else if (event.wheelDelta <= -120)
        {
            delta = -1;
        }

        if (this.video.connected)
        {
            var command = {
                "command": "mouse_wheel",
                "mouse_wheel": {
                    //"mouse_x": event.clientX,
                    //"mouse_y": event.clientY,
                    "mouse_x": event.offsetX,
                    "mouse_y": event.offsetY,
                    "delta": delta
                }
            };
            this.videosocket.send(JSON.stringify(command));
        }
    },

    // The user has pressed a mouse button, we send command "mouse_down" to
    // the video streaming server.
    contextMenuHandler : function (event){
        event.preventDefault();
        return(false);
    },


    // convert key event to json object
    getKeyEventJson : function (keyevent){
        var key_json = {
            "keyCode":  keyevent.keyCode,
            "which":    keyevent.which,
            "charCode": keyevent.charCode,
            "char":     String.fromCharCode(keyevent.which),
            "shiftKey": keyevent.shiftKey,
            "ctrlKey":  keyevent.ctrlKey,
            "altKey":   keyevent.altKey,
            "metaKey":  keyevent.metaKey
        };

        return key_json
    },

    // A key has been pressed (special keys)
    keyDownHandler : function (event){
        if (this.video.connected)
        {
            var command = {
                "command": "key_down",
                "key_down" : this.getKeyEventJson(event)
            };
            command.key_down.x = this.mouse_x;
            command.key_down.y = this.mouse_y;
            this.videosocket.send(JSON.stringify(command));
            console.log(command);
            event.stopPropagation();
        }
    },

    // A key has been pressed (char keys)
    keyPressHandler : function (event){
        console.log(event);
        if (this.video.connected)
        {
            var command = {
                "command": "key_press",
                "key_press" : this.getKeyEventJson(event)
            };
            command.key_press.x = this.mouse_x;
            command.key_press.y = this.mouse_y;
            this.videosocket.send(JSON.stringify(command));
            console.log(command);
            event.stopPropagation();
        }
    },

    // A key has been released (for special keys)
    keyUpHandler : function (event){
        if (this.video.connected)
        {
            var command = {
                "command": "key_up",
                "key_up" : this.getKeyEventJson(event)
            };
            command.key_up.x = this.mouse_x;
            command.key_up.y = this.mouse_y;
            this.videosocket.send(JSON.stringify(command));
            console.log(command);
            event.stopPropagation();
        }
    },

    resizeHandler : function (){
        var element_w = this.vframe.scrollWidth;
        var element_h = this.vframe.scrollHeight;
        if (element_w <= 0)
        {
            element_w = 1;
        }
        if (element_h <= 0)
        {
            element_h = 1;
        }
        console.log("resize: "+element_w+" "+element_h)
        var command = {
            "command": "video_resize",
            "video_resize" : {
                "video_width" :  element_w,
                "video_height" : element_h
            }
        };
        this.videosocket.send(JSON.stringify(command));
        console.log(JSON.stringify(command));
        // console.log("video_width: " + video_w + ", video_height: " + video_h);

        // Restart the video player here
        // sourceBuffer.remove(0, 10000000);

        // var element = document.getElementById('video');
        // var positionInfo = element.getBoundingClientRect();
        // var height = positionInfo.height;
        // var width = positionInfo.width;
        // console.log("width: " + width + ", height: " + height);
    },


});

module.exports = {
    PVDisplayModel : PVDisplayModel,
    PVDisplayView : PVDisplayView,
    VStreamModel : VStreamModel,
    VStreamView : VStreamView
};
