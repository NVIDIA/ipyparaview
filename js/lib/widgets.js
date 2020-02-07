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
        _model_module_version : '0.1.1',
        _view_module_version : '0.1.1'
    })
});

/*
 * Helper functions for vector math
 */
function norm(x){
    return Math.sqrt(x[0]*x[0] + x[1]*x[1] + x[2]*x[2]);
}

function normalize(x){
    r = norm(x);
    return [ x[0]/r, x[1]/r, x[2]/r ];
}

function cross(x, y){
    return [ x[1]*y[2] - x[2]*y[1],
             x[2]*y[0] - x[0]*y[2],
             x[0]*y[1] - x[1]*y[0] ];
}

function cartToSphr(x){
    var r = norm(x);
    return [r,
        Math.atan2(x[0], x[2]),
        Math.asin(x[1]/r)];
}

function sphrToCart(x){
    return [ x[0]*Math.sin(x[1])*Math.cos(x[2]),
             x[0]*Math.sin(x[2]),
             x[0]*Math.cos(x[1])*Math.cos(x[2]) ];
}

function vadd(x,y){
    return [ x[0] + y[0], x[1] + y[1], x[2] + y[2] ];
}
function vscl(x,y){
    return [ x[0]*y, x[1]*y, x[2]*y ];
}


var PVDisplayView = widgets.DOMWidgetView.extend({
        render: function(){
            this.model.on('change:frame', this.frameChange, this);

            // Create 'div' and 'canvas', and attach them to the...erm, "el"
            this.renderWindow = document.createElement('div');
            this.canvas = document.createElement('canvas');
            this.renderWindow.appendChild(this.canvas);
            this.el.appendChild(this.renderWindow);

            //convenience references
            let view = this;
            let model = view.model;
            //var canvas = this.canvas;

            var cf = model.get('camf');
            var cp = cartToSphr(vadd(model.get('camp'), vscl(cf, -1.0)));
            var cu = model.get('camu');

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
                let rect = canvas.getBoundingClientRect();

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

            //mouse event throttling--wait throttlems between mouse events
            const throttlems = 1000.0/20.0;
            var lastMouseT = Date.now();
            function updateCam(){
                var mt = Date.now();
                if(mt - lastMouseT > throttlems){
                    model.set({"camp": vadd(sphrToCart(cp), cf), "camf": cf});
                    model.save_changes(); //triggers state synchronization (I think)
                    view.send({event: 'updateCam', data: ''}); //trigger a render
                    lastMouseT = mt;
                }
            };


            // Mouse event handling -- drag and scroll
            function handleDrag(e){
                const scl = 5.0; //rotation scaling factor
                const phiLim = 1.5175; //limit phi from reaching poles

                let md = getMouseDelta(e);

                cp[1] -= 5.0*md.x;
                cp[2] = Math.max(-phiLim, Math.min(phiLim, cp[2]-5.0*md.y));
                updateCam();
            };

            function handleMidDrag(e){
                const scl = 1.0/1.25;

                let md = getMouseDelta(e);

                let ccp = sphrToCart(cp);
                let h = normalize(cross(ccp, cu)); //horizontal
                let v = normalize(cross(ccp,  h)); //vertical
                let d = vscl(vadd(vscl(h,md.x), vscl(v,md.y)), cp[0]*scl); //position delta
                cf = vadd(cf, d);
                //NOTE: cp is relative to cf

                updateCam();
            };

            function handleScroll(e){
                const wheelScl = 40.0;
                const dScl = 0.05;
                const rlim = 0.00001;

                e.preventDefault();
                e.stopPropagation();
                let d = e.wheelDelta ? e.wheelDelta/wheelScl : e.detail ? -e.detail : 0;
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

            this.canvas.addEventListener('mouseup',function(e){
                if(e.button == 0){
                    view.canvas.removeEventListener('mousemove',handleDrag,false);
                }else if(e.button == 1){
                    view.canvas.removeEventListener('mousemove',handleMidDrag,false);
                }
            }, false);

            this.canvas.addEventListener('wheel', handleScroll, false);
    },

    frameChange: function() {
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
});

module.exports = {
    PVDisplayModel : PVDisplayModel,
    PVDisplayView : PVDisplayView
};
