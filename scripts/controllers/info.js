(function() {
  'use strict';  angular.module('kvey.siteApp').controller('InfoCtrl', function($scope, $location, $routeParams, $http) {
    if ($routeParams.filters != null) {
      $scope.filters = $routeParams.filters.split(",");
    }
    $http.get("/datapoints/maps/points.json").then(function(data) {
      return $scope.datapoints = data.data;
    });
    $http.get("/datapoints/maps/projects.json").then(function(data) {
      return $scope.projects = data.data;
    });
    return $http.get("/datapoints/maps/tags.json").then(function(data) {
      return $scope.dataTags = data.data;
    });
  });

}).call(this);
