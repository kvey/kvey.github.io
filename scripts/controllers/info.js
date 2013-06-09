(function() {
  'use strict';  angular.module('kvey.siteApp').controller('InfoCtrl', function($scope, $location, $routeParams, $http) {
    var allPoints, filterPoints;

    $scope.datapoints = [];
    $scope.projects = [];
    $scope.$parent.nav = {};
    $scope.$parent.nav.information = "active";
    if ($routeParams.filters != null) {
      $scope.filters = $routeParams.filters.split(",");
    }
    $http.get("/datapoints/maps/points.json").then(function(data) {
      $scope.datapointsSet = data.data;
      return allPoints();
    });
    $http.get("/datapoints/maps/projects.json").then(function(data) {
      var k, v;

      $scope.projectsSet = data.data;
      return $scope.projects = (function() {
        var _ref, _results;

        _ref = $scope.projectsSet;
        _results = [];
        for (k in _ref) {
          v = _ref[k];
          _results.push(k);
        }
        return _results;
      })();
    });
    allPoints = function() {
      var k, point, pointArray, _ref;

      pointArray = [];
      _ref = $scope.datapointsSet;
      for (k in _ref) {
        point = _ref[k];
        pointArray.push(point);
      }
      return $scope.datapoints = pointArray;
    };
    filterPoints = function(vector, source, filter) {
      if ($scope[source] !== filter) {
        $scope[source] = filter;
      }
      switch (vector) {
        case "project":
          if ($scope.projectsSet != null) {
            if ($scope.projectsSet[filter] != null) {
              $scope.datapoints = $scope.projectsSet[filter];
              return;
            }
          }
          break;
        case "point":
          if ($scope.datapointsSet != null) {
            if ($scope.datapointsSet[filter] != null) {
              $scope.datapoints = [$scope.datapointsSet[filter]];
              return;
            }
          }
      }
      return allPoints();
    };
    $scope.filterPoints = filterPoints;
    filterPoints();
    $scope.$watch("searchFilterProject", function(filter) {
      return filterPoints("project", $scope.searchFilterProject, filter);
    });
    $scope.$watch("searchFilterPoint", function(filter) {
      return filterPoints("point", $scope.searchFilterPoint, filter);
    });
    return $http.get("/datapoints/maps/tags.json").then(function(data) {
      return $scope.dataTags = data.data;
    });
  });

}).call(this);
