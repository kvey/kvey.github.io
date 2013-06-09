'use strict';

angular.module('kvey.siteApp')
  .controller('MainCtrl', function ($scope) {
    $scope.$parent.nav = {};
    $scope.$parent.nav.about = "active";
  });
