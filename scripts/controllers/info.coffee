'use strict'

angular.module('kvey.siteApp')
  .controller 'InfoCtrl', ($scope, $location, $routeParams, $http) ->

    $scope.datapoints = []
    $scope.projects = []

    $scope.$parent.nav = {}
    $scope.$parent.nav.information = "active"

    if $routeParams.filters?
      $scope.filters = $routeParams.filters.split(",")

    $http.get("/datapoints/maps/points.json").then((data) ->
      $scope.datapointsSet = data.data
      allPoints()
    )

    $http.get("/datapoints/maps/projects.json").then((data) ->
      $scope.projectsSet = data.data
      $scope.projects = (k for k,v of $scope.projectsSet)
    )

    allPoints = ->
      pointArray = []
      for k,point of $scope.datapointsSet
        pointArray.push(point)
      $scope.datapoints = pointArray

    filterPoints = (vector, source, filter) ->
      if $scope[source] != filter then $scope[source] = filter
      switch vector
        when "project"
          if $scope.projectsSet?
            if $scope.projectsSet[filter]?
              $scope.datapoints = $scope.projectsSet[filter]
              return
        when "point"
          if $scope.datapointsSet?
            if $scope.datapointsSet[filter]?
              $scope.datapoints = [$scope.datapointsSet[filter]]
              return
      allPoints()

    $scope.filterPoints = filterPoints

    filterPoints()

    $scope.$watch "searchFilterProject", (filter) ->
      filterPoints("project", $scope.searchFilterProject, filter)

    $scope.$watch "searchFilterPoint", (filter) ->
      filterPoints("point", $scope.searchFilterPoint, filter)


    $http.get("/datapoints/maps/tags.json").then((data) ->
      $scope.dataTags = data.data
    )
