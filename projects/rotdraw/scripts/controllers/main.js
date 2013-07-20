'use strict';

angular.module('RotDrawApp')
  .controller('MainCtrl', function ($scope) {

    function PathObj(ctx) {
        this.ctx = ctx;
        this.points = [];
    }

    PathObj.prototype = {
      addPoint: function(x, y){
          this.points.push({ x: x, y: y });
      },

      render: function(){
        var points = this.points,
            ctx    = this.ctx;
        if (points.length < 6) return;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var i = 1; i < points.length - 2; i++) {
            var c = (points[i].x + points[i + 1].x) / 2,
                d = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, c, d);
        }
        ctx.quadraticCurveTo(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
        ctx.stroke();
      },

      clearPath: function() {
        this.points = [];
      }
    }

    function RelativePoint(x, y, dependsOn){
      this.dependsOn = dependsOn || [];
      this._x = x; 
      this._y = y;
      return this;
    }

    RelativePoint.prototype = {
      set x(val){
        this.onMove(this.x - val, 0);
        this._x = val;
      },
      get x(val){
        return this._x;
      },
      set y(val){
        //position - new position
        this.onMove(0, this.y - val);
        this._y = val;
      },
      get y(val){
        return this._y;
      },
      onMove: function(deltaX, deltaY){
        for(var dep in this.dependsOn){
          this.dependsOn[dep].x = this.dependsOn[dep].x - deltaX;
          this.dependsOn[dep].y = this.dependsOn[dep].y - deltaY;
        }
      }
    }


    function ChainedArmsNode(config){
      config   = config || {};
      this.len = config.len || 0;
      this.prev = config.prev || false;
      if(this.prev){
        var point = new RelativePoint(this.prev.point.x+this.len, this.prev.point.y);
        this.prev.point.dependsOn.push(point);
        this.point = point;
      }else{
        this.point = new RelativePoint(150, 150)
      }
      this.angular = config.angular || 0.0;
      this.onMove = function(){};
    }

    ChainedArmsNode.prototype = {
      set _len(val){
        if(this.len){
          // need to subtract from prior elements
          if(this.prev){
            this.point.y = ((this.point.y - this.prev.point.y) / this.len * val) + this.prev.point.y
            this.point.x = ((this.point.x - this.prev.point.x) / this.len * val) + this.prev.point.x
          }          
          this.len = val;
        }else{
          this.len = val;
        }
      },
      get _len(){
        return this.len;
      },

      move: function(vec){
        this.point.x = vec.x;
        this.point.y = vec.y;
      },

      attach: function(callback){
        this.onMove = callback;
      },

      detach: function(callback){
        this.onMove = function(){};
      }
    }

    function ChainedArms(ctx){
      this.ctx = ctx;
      this.nodes = [];
      // initializes with a 150,150 node
      //maybe it just shouldn't init with a node
      this.nodes.push(new ChainedArmsNode());
    }

    ChainedArms.prototype = {
      addNode: function(nodeArgs){
        nodeArgs.prev = this.nodes[this.nodes.length-1]; // current last node is prev of new node
        this.nodes.push(new ChainedArmsNode(nodeArgs)); // create node with arguments
      },

      chainedRotation: function(){
        for(var i = 0 ; i < this.nodes.length ; i++){
          //for each node
          var node = this.nodes[i], 
              prevNode = this.nodes[i-1], 
              offset, 
              sin, cos;
          if(prevNode){
            offset = prevNode.point;
          }else{
            offset = {x:150,y:150};
          }
          sin = Math.sin(node.angular);
          cos = Math.cos(node.angular);
          node.onMove(node);
          //subsequent nodes not being moved
          var x = node.point.x - offset.x,
              y = node.point.y - offset.y;
          node.move({
            x: ((x * cos) - (y * sin)) + offset.x,
            y: ((x * sin) + (y * cos)) + offset.y
          });
        }
      },

      render: function(){
        var ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo( this.nodes[0].point.x, this.nodes[0].point.y );
        for(var i = 1 ; i < this.nodes.length ; i++){
          var node = this.nodes[i];
          ctx.lineTo(node.point.x, node.point.y);
        }
        ctx.strokeStyle = "rgba(200,0,0,1.0)";
        ctx.stroke();
      }
    }

    // canvas setup and draw
    var pathObj;
    var cArms;
    $scope.setup = function(ctx){
      cArms = new ChainedArms(ctx);
      pathObj = new PathObj(ctx);
      cArms.addNode(new ChainedArmsNode({
        len: 20,
        angular: -0.01
      }));

      $scope.nodes = cArms.nodes;
      $scope.clearPath = function(){
        pathObj.clearPath();
      }
      $scope.addNode = function(){
        // need to use last node always 
        cArms.nodes[cArms.nodes.length-1].detach();
        cArms.addNode(new ChainedArmsNode({
          len: 20,
          angular: 0.01
        }));
        cArms.nodes[cArms.nodes.length-1].attach(function(node){
          pathObj.addPoint(node.point.x, node.point.y);
        });
      }
    }
    $scope.draw = function(ctx){
      cArms.chainedRotation();
      pathObj.render();
      cArms.render();
    }
  });
