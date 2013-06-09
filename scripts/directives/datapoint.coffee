'use strict';

# point.title - title for this datapoint
# point.projects - projects this information is associated with
# point.tags - filtering and categorical tags
# point.links - links to other datapoints by name
# point.md - markdown multiline string

angular.module('kvey.siteApp')
  .directive('datapoint', ($compile, $http) ->
    converter = new Showdown.converter()
    return {
      restrict: 'A'
      replace: true,
      link: (scope, element, attrs) ->
        scope.isCollapsed = true
        template = """
          <div class="datapoint">
            <h3>{{point.datapoint.title}}</h3>
            <div class="datapoint-info">
              <div class="markdown" ng-bind-html-unsafe="point.datapoint.md"></div>
              <div class="btn-group" ng-show="point.datapoint.projects">
                <button class="btn btn-primary dropdown-toggle" data-toggle="dropdown">
                  Projects <span class="caret"> </span>
                </button>
                <ul class="dropdown-menu">
                  <li ng-repeat="project in point.datapoint.projects"><a href="#">{{project}}</a></li>
                </ul>
              </div>
              <div class="btn-group" ng-show="point.datapoint.links">
                <button class="btn btn-primary dropdown-toggle" data-toggle="dropdown">
                  Links <span class="caret"> </span>
                </button>
                <ul class="dropdown-menu">
                  <li ng-repeat="link in point.datapoint.links"><a href="#">{{link}}</a></li>
                </ul>
              </div>
            </div>
          </div>
          """

        if "src" in attrs
          $http.get(attrs.src).then (data) ->
            point = jsyaml.load(data.data)
            point.md = converter.makeHtml(point.md)
            element.html($compile(template)(point))
        else if scope.point?
          point = scope.point.datapoint
          point.md = converter.makeHtml(point.md)
          element.html(template).show()
          $compile(element.contents())(scope)
          #element.html($compile(template)(point))
        else
          element.html("<div class='markdown'>No source was set</div>")
    }
  )
