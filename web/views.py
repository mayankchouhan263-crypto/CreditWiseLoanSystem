import json
import os
import pandas as pd
import numpy as np

from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings


# ── Load model once at startup ────────────────────────────────────────────────
_model      = None
_scaler     = None
_load_error = None

def _load_model():
    global _model, _scaler, _load_error
    if _model is not None:
        return _model, _scaler, None
    if _load_error is not None:
        return None, None, _load_error
    try:
        import joblib
        model_path  = settings.MODEL_PATH
        scaler_path = settings.SCALER_PATH
        if not os.path.exists(model_path):
            _load_error = f"loan_model.pkl not found at: {model_path}"
            return None, None, _load_error
        if not os.path.exists(scaler_path):
            _load_error = f"scaler.pkl not found at: {scaler_path}"
            return None, None, _load_error
        _model  = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
        print(f"[CreditWise] Model loaded from {model_path}")
        return _model, _scaler, None
    except Exception as e:
        _load_error = f"Failed to load model: {str(e)}"
        return None, None, _load_error


FEATURE_NAMES = [
    'Applicant_Income', 'Coapplicant_Income', 'Age', 'Dependents', 'Existing_Loans',
    'Savings', 'Loan_Amount', 'Loan_Term', 'Education_Level',
    'Employment_Status_Salaried', 'Employment_Status_Self-employed', 'Employment_Status_Unemployed',
    'Marital_Status_Single', 'Loan_Purpose_Car', 'Loan_Purpose_Education',
    'Loan_Purpose_Home', 'Loan_Purpose_Personal', 'Property_Area_Semiurban',
    'Property_Area_Urban', 'Gender_Male', 'Employer_Category_Government',
    'Employer_Category_MNC', 'Employer_Category_Private', 'Employer_Category_Unemployed',
    'Collateral_Ratio', 'DTI_Ratio_sq', 'Credit_Score_sq'
]


def _build_features(data: dict):
    # Raw rupee values — no scaling
    applicant_income   = float(data.get('applicant_income',   100000))
    coapplicant_income = float(data.get('coapplicant_income',      0))
    age                = float(data.get('age',                    35))
    dependents         = float(data.get('dependents',              0))
    credit_score       = float(data.get('credit_score',          700))
    existing_loans     = float(data.get('existing_loans',          0))
    dti_ratio          = float(data.get('dti_ratio',               0))
    savings            = float(data.get('savings',            300000))
    collateral_value   = float(data.get('collateral_value',        0))
    loan_amount        = float(data.get('loan_amount',       2000000))
    loan_term          = float(data.get('loan_term',              36))
    education_level    = float(data.get('education_level',         1))

    # Engineered features
    dti_ratio_sq     = dti_ratio ** 2
    credit_score_sq  = credit_score ** 2
    collateral_ratio = collateral_value / (loan_amount + 1)

    # Employment Status — drop='first' drops Contract
    employment_status = data.get('employment_status', 'salaried')
    emp_salaried      = 1.0 if employment_status == 'salaried'      else 0.0
    emp_self          = 1.0 if employment_status == 'self-employed'  else 0.0
    emp_unemployed    = 1.0 if employment_status == 'unemployed'     else 0.0

    # Marital Status — drop='first' drops Married
    marital_status = data.get('marital_status', 'married')
    marital_single = 1.0 if marital_status == 'single' else 0.0

    # Loan Purpose — drop='first' drops Business
    loan_purpose     = data.get('loan_purpose', 'personal')
    purpose_car      = 1.0 if loan_purpose == 'car'       else 0.0
    purpose_edu      = 1.0 if loan_purpose == 'education'  else 0.0
    purpose_home     = 1.0 if loan_purpose == 'home'       else 0.0
    purpose_personal = 1.0 if loan_purpose == 'personal'   else 0.0

    # Property Area — drop='first' drops Rural
    property_area  = data.get('property_area', 'urban')
    area_semiurban = 1.0 if property_area == 'semiurban' else 0.0
    area_urban     = 1.0 if property_area == 'urban'     else 0.0

    # Gender — drop='first' drops Female
    gender      = data.get('gender', 'male')
    gender_male = 1.0 if gender == 'male' else 0.0

    # Employer Category — drop='first' drops Business
    employer_category  = data.get('employer_category', 'private')
    emp_cat_govt       = 1.0 if employer_category == 'government' else 0.0
    emp_cat_mnc        = 1.0 if employer_category == 'mnc'        else 0.0
    emp_cat_private    = 1.0 if employer_category == 'private'    else 0.0
    emp_cat_unemployed = 1.0 if employer_category == 'unemployed' else 0.0

    # Build DataFrame with correct feature names — no warning
    features = pd.DataFrame([[
        applicant_income, coapplicant_income, age, dependents, existing_loans,
        savings, loan_amount, loan_term, education_level,
        emp_salaried, emp_self, emp_unemployed, marital_single,
        purpose_car, purpose_edu, purpose_home, purpose_personal,
        area_semiurban, area_urban, gender_male,
        emp_cat_govt, emp_cat_mnc, emp_cat_private, emp_cat_unemployed,
        collateral_ratio, dti_ratio_sq, credit_score_sq
    ]], columns=FEATURE_NAMES)

    meta = {
        'credit_score':      credit_score,
        'dti_ratio':         dti_ratio,
        'existing_loans':    existing_loans,
        'collateral_value':  collateral_value,
        'collateral_ratio':  collateral_ratio,
        'employment_status': employment_status,
    }
    return features, meta


def _build_tips(meta, probability):
    tips = []
    if meta['credit_score'] < 600:
        tips.append('Your credit score is below 600. Improving it above 700 can significantly boost approval chances.')
    if meta['dti_ratio'] > 0.5:
        tips.append('Your debt-to-income ratio is high (above 50%). Try clearing existing debts before applying.')
    if meta['existing_loans'] > 3:
        tips.append('Having many existing loans reduces approval chances. Try closing some before applying.')
    if meta['collateral_value'] == 0 and probability < 60:
        tips.append('Providing collateral can significantly improve your approval odds.')
    if meta['employment_status'] == 'unemployed':
        tips.append('Lenders prefer stable employment. Consider applying after securing a job.')
    if not tips:
        tips.append('Your profile looks strong! Consider negotiating a lower interest rate.')
    return tips


def index(request):
    return render(request, 'index.html')


@csrf_exempt
def predict(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required.'}, status=405)

    model, scaler, load_err = _load_model()
    if load_err:
        return JsonResponse({'error': load_err}, status=500)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON in request body.'}, status=400)

    try:
        features, meta  = _build_features(data)
        features_scaled = scaler.transform(features)
        prob_raw        = model.predict_proba(features_scaled)[0][1]
        probability     = round(prob_raw * 100)
    except Exception as e:
        return JsonResponse({'error': f'Prediction failed: {str(e)}'}, status=500)

    if probability >= 75:
        verdict, verdict_class = 'Likely Approved', 'green'
    elif probability >= 50:
        verdict, verdict_class = 'Moderate Chance', 'amber'
    elif probability >= 30:
        verdict, verdict_class = 'Low Probability', 'orange'
    else:
        verdict, verdict_class = 'Likely Rejected', 'red'

    return JsonResponse({
        'probability':   probability,
        'verdict':       verdict,
        'verdict_class': verdict_class,
        'dti':           round(meta['dti_ratio'] * 100, 1),
        'tips':          _build_tips(meta, probability),
        'factors': {
            'credit_score':   min(round((meta['credit_score'] - 300) / 6), 100),
            'dti_score':      round(max(0, 100 - meta['dti_ratio'] * 100)),
            'existing_loans': round(max(0, 100 - meta['existing_loans'] * 16)),
            'collateral':     min(round(meta['collateral_ratio'] * 50), 100),
        },
    })


@csrf_exempt
def emi(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST request required.'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON in request body.'}, status=400)

    try:
        principal     = float(data.get('principal', 0))
        annual_rate   = float(data.get('annual_rate', 10))
        tenure_months = int(data.get('tenure_months', 36))
        proc_fee_pct  = float(data.get('processing_fee_pct', 0))
        prepayment    = float(data.get('monthly_prepayment', 0))
        interest_type = data.get('interest_type', 'reducing')

        if principal <= 0:
            return JsonResponse({'error': 'Loan amount must be greater than 0.'}, status=400)
        if tenure_months <= 0:
            return JsonResponse({'error': 'Tenure must be greater than 0.'}, status=400)
        if annual_rate < 0:
            return JsonResponse({'error': 'Interest rate cannot be negative.'}, status=400)

        r = annual_rate / 12 / 100

        if interest_type == 'flat':
            years          = tenure_months / 12
            total_interest = principal * (annual_rate / 100) * years
            total_payment  = principal + total_interest
            emi_amount     = total_payment / tenure_months
            interest_note  = 'Flat Rate: Interest is calculated on the full original principal for the entire loan tenure. The effective interest rate is roughly double the stated flat rate.'

        elif interest_type == 'compound':
            n              = 12
            years          = tenure_months / 12
            total_amount   = principal * (1 + annual_rate / 100 / n) ** (n * years)
            total_interest = total_amount - principal
            total_payment  = total_amount
            emi_amount     = total_amount / tenure_months
            interest_note  = 'Compound Interest: Interest is calculated on the principal plus all accumulated interest (monthly compounding). Results in higher total interest.'

        else:
            if r == 0:
                emi_amount = principal / tenure_months
            else:
                emi_amount = (principal * r * (1 + r) ** tenure_months
                              / ((1 + r) ** tenure_months - 1))
            total_payment  = emi_amount * tenure_months
            total_interest = total_payment - principal
            interest_note  = 'Reducing Balance: Interest is charged only on the outstanding principal. As you repay, interest decreases. Most common bank method.'

        proc_fee         = principal * proc_fee_pct / 100
        total_cost       = total_payment + proc_fee
        effective_tenure = tenure_months
        months_saved     = 0

        if interest_type == 'reducing' and prepayment > 0 and r > 0:
            balance = principal
            month   = 0
            while balance > 0.01 and month < tenure_months * 2:
                interest_part  = balance * r
                principal_paid = emi_amount - interest_part + prepayment
                if principal_paid <= 0:
                    break
                balance -= principal_paid
                month   += 1
            effective_tenure = min(month, tenure_months)
            months_saved     = tenure_months - effective_tenure

        balance      = principal
        amortization = []
        for year in range(1, (tenure_months // 12) + 2):
            months_this_year = min(12, tenure_months - (year - 1) * 12)
            if months_this_year <= 0:
                break
            open_balance = balance
            yr_principal = 0.0
            yr_interest  = 0.0
            for _ in range(months_this_year):
                if balance <= 0.01:
                    break
                if interest_type == 'flat':
                    int_part  = total_interest / tenure_months
                    prin_part = principal / tenure_months
                else:
                    int_part  = balance * r
                    prin_part = emi_amount - int_part
                yr_interest  += max(0, int_part)
                yr_principal += max(0, prin_part)
                balance      -= max(0, prin_part)
            amortization.append({
                'year':          year,
                'open_balance':  round(open_balance, 2),
                'principal':     round(yr_principal, 2),
                'interest':      round(yr_interest, 2),
                'total_paid':    round(yr_principal + yr_interest, 2),
                'close_balance': round(max(0, balance), 2),
            })

        return JsonResponse({
            'emi':              round(emi_amount, 2),
            'principal':        round(principal, 2),
            'total_interest':   round(total_interest, 2),
            'total_payment':    round(total_payment, 2),
            'processing_fee':   round(proc_fee, 2),
            'total_cost':       round(total_cost, 2),
            'effective_tenure': effective_tenure,
            'months_saved':     months_saved,
            'interest_type':    interest_type,
            'interest_note':    interest_note,
            'amortization':     amortization,
        })

    except Exception as e:
        return JsonResponse({'error': f'EMI calculation failed: {str(e)}'}, status=500)