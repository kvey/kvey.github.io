'use strict';

angular.module('RotDrawApp')
  .directive('jslider', function () {
    //really as a directive this should support more of the jqueryui slider functionality
    return {
      restrict: 'EA',
      scope: {
        jslider: "=jslider",
        jsliderMin: "=jsliderMin",
        jsliderMax: "=jsliderMax",
        jsliderDiv: "=jsliderDiv",
        jsliderSlide: "=jsliderSlide"
      },
      link: function postLink(scope, element, attrs) {
        $(element).slider({
          min: scope.jsliderMin || 0,
          max: scope.jsliderMax || 100,
          values: [scope.jslider],
          slide: function( event, ui ) {
            scope.$apply(function(){
              scope.jslider = ui.value/(scope.jsliderDiv||1);
            });
          }
        });
      }
    };
  });
