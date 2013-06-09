(function() {
  'use strict';
  var wrap,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  wrap = function(data) {
    return "<div class=\"markdown\">\n  " + data + "\n</div>";
  };

  angular.module('kvey.siteApp').directive('markdown', function($compile, $http) {
    return {
      restrict: 'E',
      replace: true,
      link: function(scope, element, attrs) {
        if (__indexOf.call(attrs, "src") >= 0) {
          return $http.get(attrs.src).then(function(data) {
            return element.html(wrap(converter.makeHtml(data.data)));
          });
        } else {
          return element.html(wrap(converter.makeHtml(element.text())));
        }
      }
    };
  });

}).call(this);
