'use strict';

var postcss = require('postcss')

var valueRegExp = /(dpr|rem|url)\((.+?)(px)?\)/
var dprRegExp = /dpr\((\d+(?:\.\d+)?)px\)/
var urlRegExp = /url\(['"]?\S+?@[1-3]x\S+?['"]?\)/

module.exports = postcss.plugin('postcss-flexible', function (options) {
  if (!options) {
    options = {}
  }

  return function (root, result) {
    var desktop = !!options.desktop
    var baseDpr = options.baseDpr || 2
    var remUnit = options.remUnit || 75
    var remPrecision = options.remPrecision || 6
    var addPrefixToSelector = options.addPrefixToSelector || function (selector, prefix) {
      if (/^html/.test(selector)) {
        return selector.replace(/^html/, 'html' + prefix)
      }
      return prefix + ' ' + selector
    }
    var aDpr = options.aDpr || [3, 2, 1]
    aDpr.sort(function(a, b){
      return b - a
    })

    // get calculated value of px or rem
    function getCalcValue (value, dpr) {
      var valueGlobalRegExp = new RegExp(valueRegExp.source, 'g')

      function getValue(val, type) {
        val = parseFloat(val.toFixed(remPrecision)) // control decimal precision of the calculated value
        return val == 0 ? val : val + type
      }
      return value.replace(valueGlobalRegExp, function ($0, $1, $2) {
        if ($1 === 'url') {
          if (dpr) {
            return 'url(' + $2.replace(/@[1-3]x/g, '@' + dpr + 'x') + ')'
          }
        } else if ($1 === 'dpr') {
          if (dpr) {
            return getValue($2 * dpr / baseDpr, 'px')
          }
        } else if ($1 === 'rem') {
          return getValue($2 / remUnit, 'rem')
        }
        return $0
      })
    }
    
    function handleDesktop (rule) {
      rule.walkDecls(function (decl) {
        if (valueRegExp.test(decl.value)) {
          if (decl.value === '0px') {
            decl.value = '0'
          } else {
            if (dprRegExp.test(decl.value) || urlRegExp.test(decl.value)) {
              decl.value = getCalcValue(decl.value, 2)
            } else {
              // only has rem()
              decl.value = getCalcValue(decl.value)
            }
          }
        }
      })
    }
    
    function handleMobile (rule) {
      if (rule.selector.indexOf('[data-dpr="') !== -1) {
        return
      }

      var newRules = []
      var hasDecls = false
  
      for (var i = 0;i < aDpr.length; i++) {
        var newRule = postcss.rule({
          selectors: rule.selectors.map(function (sel) {
            return addPrefixToSelector(sel, '[data-dpr="' + aDpr[i] + '"]')
          }),
          type: rule.type
        })
        newRules.push(newRule)
      }

      rule.walkDecls(function (decl) {
        if (valueRegExp.test(decl.value)) {
          if (decl.value === '0px') {
            decl.value = '0'
          } else {
            if (dprRegExp.test(decl.value) || urlRegExp.test(decl.value)) {
              // generate 3 new decls and put them in the new rules which has [data-dpr]
              newRules.forEach(function (newRule, index) {
                var newDecl = postcss.decl({
                  prop: decl.prop,
                  value: getCalcValue(decl.value, aDpr[index])
                })
                newRule.append(newDecl)
              })
              hasDecls = true
              decl.remove() // delete this rule
            } else {
              // only has rem()
              decl.value = getCalcValue(decl.value)
            }
          }
        }
      })

      if (hasDecls) {
        newRules.forEach(function (newRule) {
          rule.parent.insertAfter(rule, newRule)
        })
      }

      // if the origin rule has no declarations, delete it
      if (!rule.nodes.length) {
        rule.remove()
      }
    }

    root.walkRules(function (rule) {
      desktop ? handleDesktop(rule) : handleMobile(rule)
    })
  }
})
