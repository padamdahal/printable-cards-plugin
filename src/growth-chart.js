/**
 * growth-chart.js
 * ------------------------------------------------------------------
 * Reusable functions for rendering the child weight-for-age growth
 * chart as an SVG string, to be dropped into a spot in the card's
 * JSON design marked with a placeholder token (e.g. "{{growthChart}}").
 *
 * Usage inside the Card Designer (jQuery v6 app):
 *
 *   var svg = GrowthChart.buildSVG({
 *     sex: 'f',                          // 'm' or 'f'
 *     points: GrowthChart.pointsFromEvents(events, dob, weightDeUid)
 *   });
 *   cardHtml = GrowthChart.injectPlaceholder(cardHtml, '{{growthChart}}', svg);
 *   $('#cardContainer').html(cardHtml);
 *
 * No dependencies. Attaches a single global: window.GrowthChart.
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  // ---------- Reference bands (illustrative WHO-style weight-for-age, kg) ----------
  // Replace with official WHO Growth Standards LMS data before clinical use.
  var AGES = [0, 1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 21, 24];
  var REF = {
    m: {
      median: [3.3, 4.5, 5.6, 6.4, 7.0, 7.5, 7.9, 8.9, 9.6, 10.3, 10.9, 11.5, 12.2],
      sd2:    [2.5, 3.4, 4.3, 5.0, 5.6, 6.0, 6.4, 7.1, 7.7, 8.3, 8.8, 9.2, 9.7],
      sd3:    [2.1, 2.9, 3.8, 4.4, 4.9, 5.3, 5.7, 6.2, 6.9, 7.4, 7.8, 8.2, 8.6]
    },
    f: {
      median: [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 8.2, 8.9, 9.6, 10.2, 10.9, 11.5],
      sd2:    [2.4, 3.2, 3.9, 4.5, 5.0, 5.4, 5.7, 6.3, 6.9, 7.5, 7.9, 8.3, 8.7],
      sd3:    [2.0, 2.7, 3.4, 3.9, 4.4, 4.8, 5.1, 5.6, 6.1, 6.6, 6.9, 7.3, 7.6]
    }
  };

  function interp(arr, x) {
    if (x <= AGES[0]) return arr[0];
    if (x >= AGES[AGES.length - 1]) return arr[arr.length - 1];
    for (var i = 0; i < AGES.length - 1; i++) {
      if (x >= AGES[i] && x <= AGES[i + 1]) {
        var t = (x - AGES[i]) / (AGES[i + 1] - AGES[i]);
        return arr[i] + t * (arr[i + 1] - arr[i]);
      }
    }
  }

  function monthsBetween(dobStr, eventDateStr) {
    var dob = new Date(dobStr), ev = new Date(eventDateStr);
    return (ev - dob) / (1000 * 60 * 60 * 24 * 30.4375);
  }

  /**
   * Extract {age, weight} points from raw DHIS2 event objects.
   * @param {Array} events   - array of DHIS2 event objects, each with
   *                           eventDate and dataValues [{dataElement, value}]
   * @param {String} dob     - child's date of birth, e.g. attribute value
   * @param {String} weightDeUid - data element UID holding the weight value
   * @returns {Array} points sorted by age, e.g. [{age: 2.3, weight: 5.6}, ...]
   */
  function pointsFromEvents(events, dob, weightDeUid) {
    var points = [];
    (events || []).forEach(function (ev) {
      var dv = (ev.dataValues || []).filter(function (d) {
        return d.dataElement === weightDeUid;
      })[0];
      var eventDate = ev.eventDate || ev.occurredAt; // 'occurredAt' on the newer Tracker API
      if (dv && dob && eventDate) {
        points.push({
          age: monthsBetween(dob, eventDate),
          weight: parseFloat(dv.value)
        });
      }
    });
    points.sort(function (a, b) { return a.age - b.age; });
    return points;
  }

  /**
   * Build the growth chart as an SVG markup string.
   * @param {Object} opts
   * @param {String} opts.sex     - 'm' or 'f'
   * @param {Array}  opts.points  - [{age, weight}, ...] (from pointsFromEvents or your own source)
   * @param {Number} [opts.width=740]
   * @param {Number} [opts.height=420]
   * @param {Number} [opts.xMax=24]  - months shown on the x-axis
   * @param {Number} [opts.yMax=16]  - kg shown on the y-axis
   * @returns {String} standalone <svg>...</svg> markup
   */
  function buildSVG(opts) {
    opts = opts || {};
    var sex = opts.sex === 'f' ? 'f' : 'm';
    var points = opts.points || [];
    var ref = REF[sex];

    var W = opts.width || 740, H = opts.height || 420;
    var ML = 55, MR = 20, MT = 20, MB = 40;
    var plotW = W - ML - MR, plotH = H - MT - MB;
    var xMax = opts.xMax || 24, yMax = opts.yMax || 16;
    var LEGEND_H = 28;
    var TOTAL_H = H + LEGEND_H;

    function X(age) { return ML + (Math.max(0, Math.min(age, xMax)) / xMax) * plotW; }
    function Y(weight) { return MT + plotH - (weight / yMax) * plotH; }

    function pathFor(arr) {
      return AGES.map(function (a, i) { return (i === 0 ? 'M' : 'L') + X(a) + ',' + Y(arr[i]); }).join(' ');
    }
    function areaBetween(lowerArr, upperArr) {
      var top = AGES.map(function (a, i) { return X(a) + ',' + Y(upperArr[i]); }).join(' L');
      var bottomRev = AGES.slice().reverse().map(function (a, i) {
        var idx = AGES.length - 1 - i;
        return X(a) + ',' + Y(lowerArr[idx]);
      }).join(' L');
      return 'M' + top + ' L' + bottomRev + ' Z';
    }
    var zeroLine = AGES.map(function () { return 0; });
    var topLine = AGES.map(function () { return yMax; });

    var svg = '<svg viewBox="0 0 ' + W + ' ' + TOTAL_H + '" style="width:100%; max-width:' + W + 'px; font-family:inherit;">';

    svg += '<path d="' + areaBetween(zeroLine, ref.sd3) + '" fill="#f5b3ba"></path>';
    svg += '<path d="' + areaBetween(ref.sd3, ref.sd2) + '" fill="#f6e2a0"></path>';
    svg += '<path d="' + areaBetween(ref.sd2, topLine) + '" fill="#c9e8c4"></path>';

    // light grid lines, drawn over the zone fills so they stay visible everywhere
    for (var gx = 0; gx <= xMax; gx += 2) {
      svg += '<line x1="' + X(gx) + '" y1="' + MT + '" x2="' + X(gx) + '" y2="' + (MT + plotH) + '" stroke="rgba(0,0,0,0.10)" stroke-width="1"></line>';
    }
    for (var gy = 0; gy <= yMax; gy += 2) {
      svg += '<line x1="' + ML + '" y1="' + Y(gy) + '" x2="' + (ML + plotW) + '" y2="' + Y(gy) + '" stroke="rgba(0,0,0,0.10)" stroke-width="1"></line>';
    }

    svg += '<path d="' + pathFor(ref.median) + '" fill="none" stroke="#0c7a70" stroke-width="1.5" stroke-dasharray="4,3"></path>';

    svg += '<line x1="' + ML + '" y1="' + MT + '" x2="' + ML + '" y2="' + (MT + plotH) + '" stroke="#333"></line>';
    svg += '<line x1="' + ML + '" y1="' + (MT + plotH) + '" x2="' + (ML + plotW) + '" y2="' + (MT + plotH) + '" stroke="#333"></line>';

    for (var a = 0; a <= xMax; a += 2) {
      svg += '<line x1="' + X(a) + '" y1="' + (MT + plotH) + '" x2="' + X(a) + '" y2="' + (MT + plotH + 4) + '" stroke="#333"></line>';
      svg += '<text x="' + X(a) + '" y="' + (MT + plotH + 16) + '" font-size="9" text-anchor="middle" fill="#333">' + a + '</text>';
    }
    svg += '<text x="' + (ML + plotW / 2) + '" y="' + (H - 4) + '" font-size="10" text-anchor="middle" fill="#333">उमेर (महिना)</text>';

    for (var w = 0; w <= yMax; w += 2) {
      svg += '<line x1="' + (ML - 4) + '" y1="' + Y(w) + '" x2="' + ML + '" y2="' + Y(w) + '" stroke="#333"></line>';
      svg += '<text x="' + (ML - 8) + '" y="' + (Y(w) + 3) + '" font-size="9" text-anchor="end" fill="#333">' + w + '</text>';
    }
    svg += '<text x="14" y="' + (MT + plotH / 2) + '" font-size="10" fill="#333" transform="rotate(-90 14 ' + (MT + plotH / 2) + ')" text-anchor="middle">तौल (के.जी.)</text>';

    if (points.length) {
      var linePath = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + X(p.age) + ',' + Y(p.weight); }).join(' ');
      svg += '<path d="' + linePath + '" fill="none" stroke="#1a1a1a" stroke-width="2"></path>';
      points.forEach(function (p) {
        var sd2v = interp(ref.sd2, p.age), sd3v = interp(ref.sd3, p.age);
        var color = p.weight < sd3v ? '#dc3545' : (p.weight < sd2v ? '#f2c94c' : '#2f9e44');
        svg += '<circle cx="' + X(p.age) + '" cy="' + Y(p.weight) + '" r="4.5" fill="' + color + '" stroke="#1a1a1a" stroke-width="1"></circle>';
      });
    } else {
      svg += '<text x="' + (ML + plotW / 2) + '" y="' + (MT + plotH / 2) + '" font-size="12" text-anchor="middle" fill="#999">कुनै मापन डाटा उपलब्ध छैन</text>';
    }

    // legend row, centered under the chart
    var legendItems = [
      { color: '#dc3545', label: 'अति जोखिम' },
      { color: '#f2c94c', label: 'जोखिम' },
      { color: '#2f9e44', label: 'राम्रो' }
    ];
    var swatch = 10, gap = 5, itemGap = 22, charW = 7; // charW: rough per-character width estimate for centering
    var itemWidths = legendItems.map(function (it) { return swatch + gap + it.label.length * charW; });
    var legendW = itemWidths.reduce(function (a, b) { return a + b; }, 0) + itemGap * (legendItems.length - 1);
    var lx = ML + plotW / 2 - legendW / 2;
    var ly = H + LEGEND_H / 2;

    legendItems.forEach(function (it, i) {
      svg += '<rect x="' + lx + '" y="' + (ly - swatch / 2) + '" width="' + swatch + '" height="' + swatch + '" rx="2" fill="' + it.color + '"></rect>';
      svg += '<text x="' + (lx + swatch + gap) + '" y="' + (ly + 4) + '" font-size="10" fill="#333">' + it.label + '</text>';
      lx += itemWidths[i] + itemGap;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * One-call helper: DHIS2 events + DOB in, chart SVG out.
   * @param {Object} opts
   * @param {String} opts.sex
   * @param {String} opts.dob
   * @param {Array}  opts.events        - raw DHIS2 event objects
   * @param {String} opts.weightDeUid   - data element UID for weight
   * @param {Object} [opts.svgOptions]  - passed through to buildSVG (width/height/xMax/yMax)
   * @returns {String} svg markup
   */
  function renderFromEvents(opts) {
    opts = opts || {};
    var points = pointsFromEvents(opts.events, opts.dob, opts.weightDeUid);
    var svgOpts = Object.assign({}, opts.svgOptions, { sex: opts.sex, points: points });
    return buildSVG(svgOpts);
  }

  /**
   * Replace a placeholder token in the card's JSON-design HTML string
   * with generated SVG markup. Safe no-op if the token isn't present.
   * @param {String} cardHtml
   * @param {String} placeholderToken - e.g. "{{growthChart}}"
   * @param {String} svgMarkup
   * @returns {String} cardHtml with the token replaced
   */
  function injectPlaceholder(cardHtml, placeholderToken, svgMarkup) {
    if (typeof cardHtml !== 'string') return cardHtml;
    return cardHtml.split(placeholderToken).join(svgMarkup);
  }

  global.GrowthChart = {
    pointsFromEvents: pointsFromEvents,
    buildSVG: buildSVG,
    renderFromEvents: renderFromEvents,
    injectPlaceholder: injectPlaceholder,
    monthsBetween: monthsBetween // exposed in case you need age math elsewhere
  };

})(window);
