'use strict';

/* ── Page Navigation ──────────────────────────────────────── */
function showPage(pageId, pillEl) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById(pageId).classList.add('active');
    pillEl.classList.add('active');
    if (pageId === 'emi') { calcEmi(); }
}

/* ── Slider Sync ──────────────────────────────────────────── */
function syncSlider(el, labelId, suffix) {
    var v   = parseFloat(el.value);
    var pct = ((v - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min)) * 100).toFixed(1);
    el.style.setProperty('--pct', pct + '%');
    document.getElementById(labelId).textContent = v + (suffix || '');
}

function syncEmiSlider(el, labelId, isCurrency, decimals, suffix) {
    var v   = parseFloat(el.value);
    var pct = ((v - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min)) * 100).toFixed(1);
    el.style.setProperty('--pct', pct + '%');
    var display;
    if (isCurrency) {
        display = '₹' + Math.round(v).toLocaleString('en-IN');
    } else {
        display = (decimals !== undefined ? v.toFixed(decimals) : v) + (suffix || '');
    }
    document.getElementById(labelId).textContent = display;
}

/* ── DTI Auto-Calculator ──────────────────────────────────── */
function calcDTI() {
    var monthlyIncome = parseFloat(document.getElementById('monthlyIncome').value) || 0;
    var monthlyDebt   = parseFloat(document.getElementById('monthlyDebt').value)   || 0;
    if (!monthlyIncome) {
        monthlyIncome = parseFloat(document.getElementById('applicantIncome').value) || 0;
    }
    var dti   = monthlyIncome > 0 ? monthlyDebt / monthlyIncome : 0;
    dti       = Math.min(dti, 1);
    var badge = document.getElementById('dtiBadge');
    var hint  = document.getElementById('dtiHint');
    badge.textContent = dti.toFixed(2);
    if (dti === 0) {
        badge.style.color = 'var(--gold2)';
        hint.textContent  = 'Enter your monthly debt to calculate';
    } else if (dti < 0.35) {
        badge.style.color = 'var(--green)';
        hint.textContent  = '✅ Healthy — below 35%';
    } else if (dti < 0.50) {
        badge.style.color = 'var(--amber)';
        hint.textContent  = '⚠️ Borderline — between 35% and 50%';
    } else {
        badge.style.color = 'var(--red)';
        hint.textContent  = '❌ High risk — above 50%';
    }
}

/* ── Helpers ──────────────────────────────────────────────── */
function formatINR(n) {
    return '₹' + Number(Math.round(n)).toLocaleString('en-IN');
}

/* ── Ring Animation ───────────────────────────────────────── */
function animateRing(probability) {
    var arc           = document.getElementById('ringArc');
    var el            = document.getElementById('ringPct');
    var circumference = 2 * Math.PI * 68;

    arc.style.transition       = 'none';
    arc.style.strokeDasharray  = circumference;
    arc.style.strokeDashoffset = circumference;
    arc.style.stroke           = '#f87171';
    arc.getBoundingClientRect();
    arc.style.transition       = 'stroke-dashoffset 1.1s cubic-bezier(0.17, 0.67, 0.30, 1), stroke 0.4s ease';
    arc.style.strokeDashoffset = circumference - (probability / 100) * circumference;

    var startTimestamp = null;
    var duration       = 1100;
    function step(timestamp) {
        if (!startTimestamp) startTimestamp = timestamp;
        var progress = Math.min((timestamp - startTimestamp) / duration, 1);
        var eased    = 1 - Math.pow(1 - progress, 3);
        var current  = Math.floor(eased * probability);
        var color    = current >= 75 ? '#34d399' : current >= 50 ? '#fbbf24' : current >= 30 ? '#fb923c' : '#f87171';
        arc.style.stroke = color;
        el.style.color   = color;
        el.innerHTML     = current + '<span>%</span>';
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            var fc = probability >= 75 ? '#34d399' : probability >= 50 ? '#fbbf24' : probability >= 30 ? '#fb923c' : '#f87171';
            arc.style.stroke = fc;
            el.style.color   = fc;
            el.innerHTML     = probability + '<span>%</span>';
        }
    }
    window.requestAnimationFrame(step);
}

/* ── Loan Predictor ───────────────────────────────────────── */
async function runPrediction() {
    var btn = document.getElementById('predictBtn');
    var err = document.getElementById('predError');

    err.style.display = 'none';
    err.textContent   = '';
    document.getElementById('resultContent').style.display = 'none';
    document.getElementById('placeholder').style.display   = 'flex';
    btn.disabled    = true;
    btn.textContent = 'Checking...';

    // DTI from raw monthly values
    var monthlyIncome = parseFloat(document.getElementById('monthlyIncome').value) || 0;
    if (!monthlyIncome) {
        monthlyIncome = parseFloat(document.getElementById('applicantIncome').value) || 1;
    }
    var monthlyDebt = parseFloat(document.getElementById('monthlyDebt').value) || 0;
    var dtiRatio    = Math.min(monthlyDebt / monthlyIncome, 1);

    // No scaling — raw rupee values directly
    var payload = {
        applicant_income:   parseFloat(document.getElementById('applicantIncome').value)   || 0,
        coapplicant_income: parseFloat(document.getElementById('coapplicantIncome').value) || 0,
        age:                parseFloat(document.getElementById('age').value)                || 25,
        dependents:         parseFloat(document.getElementById('dependents').value)         || 0,
        credit_score:       parseFloat(document.getElementById('creditScore').value),
        existing_loans:     parseFloat(document.getElementById('existingLoans').value)      || 0,
        dti_ratio:          dtiRatio,
        savings:            parseFloat(document.getElementById('savings').value)            || 0,
        collateral_value:   parseFloat(document.getElementById('collateralValue').value)    || 0,
        loan_amount:        parseFloat(document.getElementById('loanAmount').value)         || 0,
        loan_term:          parseFloat(document.getElementById('loanTerm').value)           || 36,
        education_level:    parseFloat(document.getElementById('educationLevel').value),
        employment_status:  document.getElementById('employmentStatus').value,
        employer_category:  document.getElementById('employerCategory').value,
        marital_status:     document.getElementById('maritalStatus').value,
        gender:             document.getElementById('gender').value,
        loan_purpose:       document.getElementById('loanPurpose').value,
        property_area:      document.getElementById('propertyArea').value,
    };

    console.log('Payload:', JSON.stringify(payload));

    try {
        var response = await fetch('/predict/', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': window.CSRF_TOKEN },
            body:    JSON.stringify(payload),
        });
        var data = await response.json();
        console.log('Response:', JSON.stringify(data));
        if (data.error) { throw new Error(data.error); }
        showPredictionResult(data);
    } catch (e) {
        console.log('Error:', e.message);
        err.textContent   = 'Error: ' + e.message;
        err.style.display = 'block';
    } finally {
        btn.disabled    = false;
        btn.textContent = '⚡ Check Approval Probability';
    }
}

function showPredictionResult(data) {
    document.getElementById('placeholder').style.display         = 'none';
    document.getElementById('resultContent').style.display       = 'flex';
    document.getElementById('resultContent').style.flexDirection = 'column';
    document.getElementById('resultContent').style.gap           = '20px';

    setTimeout(function() { animateRing(data.probability); }, 80);

    var colorMap = { green: '#34d399', amber: '#fbbf24', orange: '#fb923c', red: '#f87171' };
    var iconMap  = { green: '✅', amber: '🟡', orange: '⚠️', red: '❌' };
    var vEl      = document.getElementById('verdictText');
    vEl.textContent = (iconMap[data.verdict_class] || '') + '  ' + data.verdict;
    vEl.style.color = colorMap[data.verdict_class] || '#fff';

    var factorColors = ['#c9a84c', '#2dd4bf', '#a78bfa', '#34d399'];
    var factorNames  = ['Credit Score', 'DTI Score', 'Existing Loans', 'Collateral'];
    var factorKeys   = ['credit_score', 'dti_score', 'existing_loans', 'collateral'];
    document.getElementById('factorBars').innerHTML = factorKeys.map(function(key, i) {
        var val = data.factors[key];
        return (
            '<div class="factor-row">' +
              '<span class="factor-name">' + factorNames[i] + '</span>' +
              '<div class="factor-track">' +
                '<div class="factor-bar" style="width:' + val + '%; background:' + factorColors[i] + ';"></div>' +
              '</div>' +
              '<span class="factor-score">' + val + '</span>' +
            '</div>'
        );
    }).join('');

    var dtiEl = document.getElementById('dtiValue');
    dtiEl.textContent = data.dti + '%';
    dtiEl.style.color = data.dti < 35 ? 'var(--green)' : data.dti < 50 ? 'var(--amber)' : 'var(--red)';

    document.getElementById('tipsContainer').innerHTML = data.tips.map(function(t) {
        return '<div class="tip">💡 ' + t + '</div>';
    }).join('');
}

/* ── EMI Calculator ───────────────────────────────────────── */
async function calcEmi() {
    var payload = {
        principal:          parseFloat(document.getElementById('eAmt').value),
        annual_rate:        parseFloat(document.getElementById('eRate').value),
        tenure_months:      parseInt(document.getElementById('eTen').value),
        processing_fee_pct: parseFloat(document.getElementById('eProcFee').value) || 0,
        monthly_prepayment: parseFloat(document.getElementById('ePrepay').value)  || 0,
        interest_type:      document.getElementById('interestType').value,
    };
    try {
        var response = await fetch('/emi/', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': window.CSRF_TOKEN },
            body:    JSON.stringify(payload),
        });
        var data = await response.json();
        if (data.error) { throw new Error(data.error); }
        showEmiResult(data);
        document.getElementById('emiError').style.display = 'none';
    } catch (e) {
        document.getElementById('emiError').textContent   = 'Error: ' + e.message;
        document.getElementById('emiError').style.display = 'block';
    }
}

function showEmiResult(data) {
    document.getElementById('eEmi').textContent      = formatINR(data.emi);
    document.getElementById('ePrin').textContent     = formatINR(data.principal);
    document.getElementById('eInterest').textContent = formatINR(data.total_interest);
    document.getElementById('eProcAmt').textContent  = formatINR(data.processing_fee);
    document.getElementById('eTotal').textContent    = formatINR(data.total_cost);
    document.getElementById('eEffTen').textContent   = data.months_saved > 0
        ? data.effective_tenure + ' months (saves ' + data.months_saved + ' months)'
        : data.effective_tenure + ' months';

    var methodLabels = { reducing: 'Reducing balance method', flat: 'Flat rate method', compound: 'Compound interest method' };
    document.getElementById('emiMethodLabel').textContent = methodLabels[data.interest_type] || 'Reducing balance method';

    var noteEl = document.getElementById('interestNote');
    noteEl.textContent   = data.interest_note;
    noteEl.style.display = 'block';

    var prepayNote = document.getElementById('prepayNote');
    if (data.interest_type !== 'reducing') {
        prepayNote.textContent   = 'Note: Prepayment savings are only calculated for the Reducing Balance method.';
        prepayNote.style.display = 'block';
    } else {
        prepayNote.style.display = 'none';
    }

    var circumference = 2 * Math.PI * 58;
    var pRatio        = data.principal / data.total_payment;
    document.getElementById('dPrincipal').setAttribute('stroke-dasharray',  circumference);
    document.getElementById('dPrincipal').setAttribute('stroke-dashoffset', circumference * (1 - pRatio));
    document.getElementById('dInterest').setAttribute('stroke-dasharray',   circumference);
    document.getElementById('dInterest').setAttribute('stroke-dashoffset',  circumference * pRatio);

    var tbody = document.getElementById('amortBody');
    tbody.innerHTML = '';
    data.amortization.forEach(function(row) {
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>Year ' + row.year + '</td>' +
            '<td>' + formatINR(row.open_balance)  + '</td>' +
            '<td class="col-green">' + formatINR(row.principal) + '</td>' +
            '<td class="col-red">'   + formatINR(row.interest)  + '</td>' +
            '<td>' + formatINR(row.total_paid)    + '</td>' +
            '<td>' + formatINR(row.close_balance) + '</td>';
        tbody.appendChild(tr);
    });
}

/* ── Init ─────────────────────────────────────────────────── */
syncSlider(document.getElementById('creditScore'), 'csDisplay', '');
syncEmiSlider(document.getElementById('eAmt'),  'eAmtDisplay',  true);
syncEmiSlider(document.getElementById('eRate'), 'eRateDisplay', false, 1, '%');
syncEmiSlider(document.getElementById('eTen'),  'eTenDisplay',  false, 0, ' months');
calcDTI();
calcEmi();