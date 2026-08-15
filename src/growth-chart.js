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
      sd3:    [2.1, 2.9, 3.8, 4.4, 4.9, 5.3, 5.7, 6.2, 6.9, 7.4, 7.8, 8.2, 8.6],
      plus2:  [4.4, 5.8, 7.1, 8.0, 8.7, 9.3, 9.8, 10.9, 11.8, 12.6, 13.3, 14.0, 14.8]
    },
    f: {
      median: [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 8.2, 8.9, 9.6, 10.2, 10.9, 11.5],
      sd2:    [2.4, 3.2, 3.9, 4.5, 5.0, 5.4, 5.7, 6.3, 6.9, 7.5, 7.9, 8.3, 8.7],
      sd3:    [2.0, 2.7, 3.4, 3.9, 4.4, 4.8, 5.1, 5.6, 6.1, 6.6, 6.9, 7.3, 7.6],
      plus2:  [4.2, 5.5, 6.6, 7.5, 8.2, 8.8, 9.3, 10.5, 11.5, 12.4, 13.2, 14.0, 14.8]
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

  // ---- Catmull-Rom -> cubic bezier smoothing, used for the reference curves ----
  function bezierSegments(coords) {
    var d = '';
    for (var i = 0; i < coords.length - 1; i++) {
      var p0 = coords[i - 1] || coords[i];
      var p1 = coords[i];
      var p2 = coords[i + 1];
      var p3 = coords[i + 2] || p2;
      var cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      var cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      var cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      var cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function smoothPath(coords) {
    return 'M' + coords[0][0] + ',' + coords[0][1] + bezierSegments(coords);
  }

  /**
   * Extract {age, weight} points from raw DHIS2 event objects.
   * @param {Array} events   - array of DHIS2 event objects
   * @param {String} dob     - child's date of birth
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
   * @param {Array}  opts.points  - [{age, weight}, ...]
   * @param {Number} [opts.width=760]
   * @param {Number} [opts.height=430]
   * @param {Number} [opts.xMax=24]   - months shown on the x-axis
   * @param {Number} [opts.yMax=16]   - kg shown on the y-axis
   * @param {Number} [opts.xStep=1]   - x-axis tick/grid interval, in months
   * @param {Number} [opts.yStep=1]   - y-axis tick/grid interval, in kg
   * @returns {String} standalone <svg>...</svg> markup
   */
  function buildSVG(opts) {
    opts = opts || {};
    var sex = opts.sex === 'f' ? 'f' : 'm';
    var points = opts.points || [];
    var ref = REF[sex];

    var W = opts.width || 760, H = opts.height || 430;
    var ML = 58, MR = 24, MT = 24, MB = 42;
    var plotW = W - ML - MR, plotH = H - MT - MB;
    var xMax = opts.xMax || 24, yMax = opts.yMax || 16;
    var xStep = opts.xStep || 1, yStep = opts.yStep || 1;
    var LEGEND_H = 30;
    var TOTAL_H = H + LEGEND_H;

    function X(age) { return ML + (Math.max(0, Math.min(age, xMax)) / xMax) * plotW; }
    function Y(weight) { return MT + plotH - (weight / yMax) * plotH; }

    function areaBetween(lowerArr, upperArr) {
      var upperCoords = AGES.map(function (a, i) { return [X(a), Y(upperArr[i])]; });
      var lowerCoordsRev = AGES.map(function (a, i) { return [X(a), Y(lowerArr[i])]; }).reverse();
      return smoothPath(upperCoords) +
        ' L' + lowerCoordsRev[0][0] + ',' + lowerCoordsRev[0][1] +
        bezierSegments(lowerCoordsRev) + ' Z';
    }
    var zeroLine = AGES.map(function () { return 0; });

    var svg = '<svg viewBox="0 0 ' + W + ' ' + TOTAL_H + '" style="width:100%; max-width:' + W + 'px; font-family:inherit;">';

    // subtle drop-shadow for the growth line + points, and a soft card background
    svg += '<defs>' +
      '<filter id="gcShadow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity="0.28"/>' +
      '</filter>' +
      '</defs>';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + TOTAL_H + '" rx="10" fill="#ffffff"></rect>';

    // zone fills — smooth curves instead of straight segments
    svg += '<path d="' + areaBetween(zeroLine, ref.sd3) + '" fill="#f6a9b2"></path>';
    svg += '<path d="' + areaBetween(ref.sd3, ref.sd2) + '" fill="#f9dd9b"></path>';
    svg += '<path d="' + areaBetween(ref.sd2, ref.plus2) + '" fill="#b7e4b8"></path>';

    // light grid, drawn over the zone fills so it stays visible on every band
    for (var gx = 0; gx <= xMax + 1e-6; gx += xStep) {
      svg += '<line x1="' + X(gx) + '" y1="' + MT + '" x2="' + X(gx) + '" y2="' + (MT + plotH) + '" stroke="rgba(0,0,0,0.08)" stroke-width="1"></line>';
    }
    for (var gy = 0; gy <= yMax + 1e-6; gy += yStep) {
      svg += '<line x1="' + ML + '" y1="' + Y(gy) + '" x2="' + (ML + plotW) + '" y2="' + Y(gy) + '" stroke="rgba(0,0,0,0.08)" stroke-width="1"></line>';
    }

    // smooth median reference line
    var medianCoords = AGES.map(function (a, i) { return [X(a), Y(ref.median[i])]; });
    svg += '<path d="' + smoothPath(medianCoords) + '" fill="none" stroke="#0c7a70" stroke-width="1.6" stroke-dasharray="5,3" stroke-linecap="round"></path>';

    // axes
    svg += '<line x1="' + ML + '" y1="' + MT + '" x2="' + ML + '" y2="' + (MT + plotH) + '" stroke="#555" stroke-width="1.2"></line>';
    svg += '<line x1="' + ML + '" y1="' + (MT + plotH) + '" x2="' + (ML + plotW) + '" y2="' + (MT + plotH) + '" stroke="#555" stroke-width="1.2"></line>';

    for (var a = 0; a <= xMax + 1e-6; a += xStep) {
      svg += '<line x1="' + X(a) + '" y1="' + (MT + plotH) + '" x2="' + X(a) + '" y2="' + (MT + plotH + 4) + '" stroke="#555"></line>';
      svg += '<text x="' + X(a) + '" y="' + (MT + plotH + 16) + '" font-size="8.5" text-anchor="middle" fill="#444">' + a + '</text>';
    }
    svg += '<text x="' + (ML + plotW / 2) + '" y="' + (H - 6) + '" font-size="11" font-weight="600" text-anchor="middle" fill="#333">उमेर (महिना)</text>';

    for (var w = 0; w <= yMax + 1e-6; w += yStep) {
      svg += '<line x1="' + (ML - 4) + '" y1="' + Y(w) + '" x2="' + ML + '" y2="' + Y(w) + '" stroke="#555"></line>';
      svg += '<text x="' + (ML - 8) + '" y="' + (Y(w) + 3) + '" font-size="8.5" text-anchor="end" fill="#444">' + w + '</text>';
    }
    svg += '<text x="16" y="' + (MT + plotH / 2) + '" font-size="11" font-weight="600" fill="#333" transform="rotate(-90 16 ' + (MT + plotH / 2) + ')" text-anchor="middle">तौल (के.जी.)</text>';

    if (points.length) {
      var linePath = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + X(p.age) + ',' + Y(p.weight); }).join(' ');
      svg += '<path d="' + linePath + '" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#gcShadow)"></path>';
      points.forEach(function (p) {
        var sd2v = interp(ref.sd2, p.age), sd3v = interp(ref.sd3, p.age);
        var color = p.weight < sd3v ? '#dc3545' : (p.weight < sd2v ? '#f2c94c' : '#2f9e44');
        svg += '<circle cx="' + X(p.age) + '" cy="' + Y(p.weight) + '" r="5.5" fill="' + color + '" stroke="#ffffff" stroke-width="1.8" filter="url(#gcShadow)"></circle>';
        svg += '<text x="' + X(p.age) + '" y="' + (Y(p.weight) - 10) + '" font-size="9" font-weight="600" text-anchor="middle" fill="#1a1a1a">' + p.weight.toFixed(1) + '</text>';
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
    var swatch = 10, gap = 5, itemGap = 22, charW = 7;
    var itemWidths = legendItems.map(function (it) { return swatch + gap + it.label.length * charW; });
    var legendW = itemWidths.reduce(function (a, b) { return a + b; }, 0) + itemGap * (legendItems.length - 1);
    var lx = ML + plotW / 2 - legendW / 2;
    var ly = H + LEGEND_H / 2;

    legendItems.forEach(function (it, i) {
      svg += '<rect x="' + lx + '" y="' + (ly - swatch / 2) + '" width="' + swatch + '" height="' + swatch + '" rx="2.5" fill="' + it.color + '"></rect>';
      svg += '<text x="' + (lx + swatch + gap) + '" y="' + (ly + 4) + '" font-size="10.5" fill="#333">' + it.label + '</text>';
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
   * @param {Object} [opts.svgOptions]  - passed through to buildSVG
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
    monthsBetween: monthsBetween
  };

})(window);
