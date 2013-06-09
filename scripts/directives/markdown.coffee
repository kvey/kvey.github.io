'use strict';

wrap = (data) ->
  """
  <div class="markdown">
    #{data}
  </div>
  """

angular.module('kvey.siteApp')
  .directive('markdown', ($compile, $http) ->
    restrict: 'E'
    replace: true,
    link: (scope, element, attrs) ->
      if "src" in attrs
        $http.get(attrs.src).then((data) ->
          element.html(wrap(converter.makeHtml(data.data)))
        )
      else
        element.html(wrap(converter.makeHtml(element.text())))
  )
