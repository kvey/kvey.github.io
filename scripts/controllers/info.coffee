'use strict'

angular.module('kvey.siteApp')
  .controller 'InfoCtrl', ($scope, $location, $routeParams, $http) ->
    if $routeParams.filters?
      $scope.filters = $routeParams.filters.split(",")

    $http.get("/datapoints/maps/points.json").then((data) ->
      $scope.datapoints = data.data
    )

    $http.get("/datapoints/maps/projects.json").then((data) ->
      $scope.projects = data.data
    )

    $http.get("/datapoints/maps/tags.json").then((data) ->
      $scope.dataTags = data.data
    )
