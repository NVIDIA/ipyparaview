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
        _model_module_version : '0.1.2',
        _view_module_version : '0.1.2'
    })
});

/*
 * Helper functions for vector math
 */
var PVDisplayView = widgets.DOMWidgetView.extend({
        render: function(){
            this.model.on('change:compressedFrame', this.compressedFrameChange, this);
            this.model.on('change:frame', this.frameChange, this);

            // Create 'div' and 'canvas', and attach them to the...erm, "el"
            this.renderWindow = document.createElement('div');
            this.canvas = document.createElement('canvas');

            // for compressed frames
            this.img = document.createElement('img');
            this.img.setAttribute('draggable', false);
            
            // for raw frames
            this.renderWindow.appendChild(this.canvas);
            this.el.appendChild(this.renderWindow);

            // make img invisible for now
            this.displayMode = 'raw';
            this.renderSurface = this.canvas;

            //convenience references
            let view = this;
            let model = view.model;

            [this.canvas.width,this.canvas.height] = model.get('resolution');

            //Perform the initial render
            let ctx = this.canvas.getContext('2d');
            if(ctx){
                let frame = new Uint8Array(this.model.get('frame').buffer);
                let imgData = ctx.createImageData(this.canvas.width, this.canvas.height);
                for(let i=0; i<imgData.data.length; i+=4){
                    imgData.data[i+0] = frame[i+0];
                    imgData.data[i+1] = frame[i+1];
                    imgData.data[i+2] = frame[i+2];
                    imgData.data[i+3] = 255;
                }
                ctx.putImageData(imgData, 0, 0);
            }

            var m0 = {x: 0.0, y: 0.0}; //last mouse position

            //converts mouse from canvas space to NDC
            function getNDC(e){
                let rect = view.renderSurface.getBoundingClientRect();

                //compute current mouse coords in NDC
                let mx = (e.clientX - rect.left)/(rect.right-rect.left);
                let my = (e.clientY - rect.top)/(rect.top-rect.bottom);

                return {x: mx, y: my};
            };

            function getMouseDelta(e){
                let m1 = getNDC(e);
                let md = {x: m1.x-m0.x, y: m1.y-m0.y};
                m0 = m1;
                return md;
            };


            var lastMouseT = Date.now();
            var wheelAccum = 0.0;


            // Mouse event handling -- drag and scroll
            function handleDrag(e){
                t = Date.now();
                if(t - lastMouseT > 1000.0/model.get('maxEventRate')){
                    view.send({event: 'rotate', 'data': getMouseDelta(e)});
                    lastMouseT = t;
                }
            };

            function handleMidDrag(e){
                t = Date.now();
                if(t - lastMouseT > 1000.0/model.get('maxEventRate')){
                    view.send({event: 'pan', 'data': getMouseDelta(e)});
                    lastMouseT = t;
                }
            };

            function handleScroll(e){
                e.preventDefault();
                e.stopPropagation();
                wheelAccum += Math.sign(e.deltaY);

                t = Date.now();
                if(t - lastMouseT > 1000.0/model.get('maxEventRate')){
                    if(wheelAccum){
                        view.send({event: 'zoom', 'data': wheelAccum});
                    }
                    wheelAccum = 0.0;
                    lastMouseT = t;
                }
            };

            // Add event handlers to render surfaces
            function addListeners(surface) {
                surface.addEventListener('mousedown',function(e){
                    m0 = getNDC(e);
                    if(e.button == 0){
                        view.renderSurface.addEventListener('mousemove',handleDrag,false);
                    }else if(e.button == 1){
                        e.preventDefault();
                        view.renderSurface.addEventListener('mousemove',handleMidDrag,false);
                    }
                }, false);

                surface.addEventListener('mouseup',function(e){
                    if(e.button == 0){
                        view.renderSurface.removeEventListener('mousemove',handleDrag,false);
                    }else if(e.button == 1){
                        view.renderSurface.removeEventListener('mousemove',handleMidDrag,false);
                    }
                }, false);

                surface.addEventListener('wheel', handleScroll, false);
            };

            addListeners(view.img);
            addListeners(view.canvas);
    },

    setVisibility: function(element, visibility) {
        if (visibility && ! this.renderWindow.contains(element)) {
            this.renderWindow.appendChild(element);
            this.renderSurface = element;
        } else if (! visibility && this.renderWindow.contains(element)) {
            this.renderWindow.removeChild(element);
        }
        return visibility;
    },

    ensureDisplayMode: function(mode) {
        if (this.displayMode == mode) {
            return;
        }
        if (mode == 'raw') {
            this.setVisibility(this.canvas, true);
            this.setVisibility(this.img, false);
        } else {
            this.setVisibility(this.canvas, false);
            this.setVisibility(this.img, true);
        }
        this.displayMode = mode;
    },

    frameChange: function() {
        this.ensureDisplayMode('raw');
        let ctx = this.canvas.getContext('2d');
        if(ctx){
            var imgData = ctx.createImageData(this.canvas.width,this.canvas.height);
            let frame = new Uint8Array(this.model.get('frame').buffer);
            for(let i=0; i<imgData.data.length; i+=4){
                imgData.data[i+0] = frame[i+0];
                imgData.data[i+1] = frame[i+1];
                imgData.data[i+2] = frame[i+2];
                imgData.data[i+3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);
        }
    },

    compressedFrameChange: function() {
        this.ensureDisplayMode('compressed');
        let compressedFrame = new Uint8Array(this.model.get('compressedFrame').buffer);
        var compressedFrameStr = new TextDecoder("utf-8").decode(compressedFrame);
        this.img.src='data:image/jpeg;base64,' + compressedFrameStr;
    },
});

module.exports = {
    PVDisplayModel : PVDisplayModel,
    PVDisplayView : PVDisplayView
};
