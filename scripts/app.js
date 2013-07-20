'use strict';

angular.module('kvey.siteApp', ["ui.bootstrap"])
  .config(function ($routeProvider, $locationProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .when('/information', {
        templateUrl: 'views/information.html',
        controller: 'InfoCtrl'
      })
      .when('/projects', {
        templateUrl: 'views/projects.html',
        controller: 'ProjCtrl'
      })
      .otherwise({
        redirectTo: '/'
      });
  });
