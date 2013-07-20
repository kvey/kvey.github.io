'use strict';

angular.module('RotDrawApp')
  .directive('rotationalDraw', function () {
    return {
      restrict: 'E',
      link: function postLink(scope, element, attrs) {

        var svg = d3.select(element).append("svg");
        var rotDraw = svg.append("g").attr("class", "rotDraw")

        var renderLine = d3.svg.line()
          .x(function(d){ return d.x; })
          .y(function(d){ return d.y; })
          .interpolate("linear");

       var renderBar = svg.append("rect")
          .attr("x", 10)
          .attr("y", 10)
          .attr("width", 10)
          .attr("height", 10)
          .attr("transform", "translate()") 
          .attr("transform", "rotate()")
    
        var render = function(data){
          lineGraph = svg.append("path")
            .attr("d", renderLine(data))
            .attr("stroke", "red")
            .attr("stroke-width", 2)
            .attr("fill", "none");
        }

        var joints = [];
        joints.push({
          x1: x1,
          y1: y1,
          x2: x2,
          y2: y2
        });

        var sim = function(){

        }


        var addPoint = function(x,y){

        }

      }
    };
  });
