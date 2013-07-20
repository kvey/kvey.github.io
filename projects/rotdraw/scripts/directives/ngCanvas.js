'use strict';

angular.module('RotDrawApp')
  .directive('ngCanvas', function () {
    return {
      restrict: 'EA',
      scope: {
        "draw": "=ngCanvasDraw",
        "setup": "=ngCanvasSetup",
        "width": "=ngCanvasWidth",
        "frameRate": "=ngCanvasFrameRate",
        "height": "=ngCanvasHeight"
      },
      link: function postLink(scope, element, attrs) {
        var Canvas = function Canvas() {
          var canvas      = document.createElement('canvas');

          this.width  = canvas.width  = scope.width;
          this.height = canvas.height = scope.height;
          this.ctx    = canvas.getContext('2d');
          this.canvas = canvas;

          element.append(this.canvas);
        }

        Canvas.prototype = {
          draw: function(callback){
            var that = this;
            this.ctx.clearRect(0, 0, this.width, this.height);
            callback(this.ctx);
            setTimeout(function(){that.draw(callback)}, scope.frameRate);
          },
          /* == Not usable currently
          clear: function(){
            this.ctx.clearRect(0, 0, this.width, this.height);
          }
          */
        }

        var c = new Canvas()
        scope.setup(c.ctx);
        c.draw(scope.draw)
      }
    };
  });
