(function() {
  'use strict';
  var __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  angular.module('kvey.siteApp').directive('datapoint', function($compile, $http) {
    var converter;

    converter = new Showdown.converter();
    return {
      restrict: 'A',
      replace: true,
      link: function(scope, element, attrs) {
        var point, template;

        scope.isCollapsed = true;
        template = "<div class=\"datapoint\">\n  <h3>{{point.datapoint.title}}</h3>\n  <div class=\"datapoint-info\">\n    <div class=\"markdown\" ng-bind-html-unsafe=\"point.datapoint.md\"></div>\n    <div class=\"btn-group\" ng-show=\"point.datapoint.projects\">\n      <button class=\"btn btn-primary dropdown-toggle\" data-toggle=\"dropdown\">\n        Projects <span class=\"caret\"> </span>\n      </button>\n      <ul class=\"dropdown-menu\">\n        <li ng-repeat=\"project in point.datapoint.projects\"><a href=\"#\">{{project}}</a></li>\n      </ul>\n    </div>\n    <div class=\"btn-group\" ng-show=\"point.datapoint.links\">\n      <button class=\"btn btn-primary dropdown-toggle\" data-toggle=\"dropdown\">\n        Links <span class=\"caret\"> </span>\n      </button>\n      <ul class=\"dropdown-menu\">\n        <li ng-repeat=\"link in point.datapoint.links\"><a href=\"#\">{{link}}</a></li>\n      </ul>\n    </div>\n  </div>\n</div>";
        if (__indexOf.call(attrs, "src") >= 0) {
          return $http.get(attrs.src).then(function(data) {
            var point;

            point = jsyaml.load(data.data);
            point.md = converter.makeHtml(point.md);
            return element.html($compile(template)(point));
          });
        } else if (scope.point != null) {
          point = scope.point.datapoint;
          point.md = converter.makeHtml(point.md);
          element.html(template).show();
          return $compile(element.contents())(scope);
        } else {
          return element.html("<div class='markdown'>No source was set</div>");
        }
      }
    };
  });

}).call(this);
