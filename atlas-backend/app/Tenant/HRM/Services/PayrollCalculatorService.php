<?php

namespace App\Tenant\HRM\Services;

use App\Central\Params\Models\SystemParam;

/**
 * Calculadora de nómina según legislación colombiana.
 * Todos los valores legales se leen desde system_params (DB central),
 * lo que permite actualizarlos cada año sin tocar código.
 */
class PayrollCalculatorService
{
    // ─── Método principal ─────────────────────────────────────────────────────

    /**
     * Calcula todos los conceptos de nómina para un empleado en un período.
     *
     * @param  float $baseSalary     Salario base mensual del contrato
     * @param  int   $workedDays     Días trabajados en el período (max 30)
     * @param  float $overtimePay   Valor horas extras (ya calculado)
     * @param  float $bonuses        Bonificaciones no constitutivas de salario
     * @param  float $commissions    Comisiones constitutivas de salario
     * @param  float $otherDeductions Otras deducciones (libranza, préstamos, etc.)
     * @param  int   $arlRisk        Clase de riesgo ARL (1-5)
     * @return array
     */
    public function calculate(
        float $baseSalary,
        int   $workedDays     = 30,
        float $overtimePay    = 0,
        float $bonuses        = 0,
        float $commissions    = 0,
        float $otherDeductions= 0,
        int   $arlRisk        = 1,
    ): array {
        // ─── Cargar parámetros desde DB (cacheados 1h) ────────────────────────
        $p = SystemParam::group('payroll');

        $smlmv              = (float) ($p['smlmv']                     ?? 1_423_500);
        $transportAllowance = (float) ($p['transport_allowance']       ?? 202_050);
        $transportThreshold = $smlmv * (float) ($p['transport_threshold_smlmv']  ?? 2);
        $solidarityThreshold= $smlmv * (float) ($p['solidarity_threshold_smlmv'] ?? 4);
        $arlRates           = $p['arl_rates'] ?? [1=>0.00522,2=>0.01044,3=>0.02436,4=>0.04350,5=>0.06960];

        $healthEmpRate      = (float) ($p['health_employee_rate']   ?? 0.04);
        $pensionEmpRate     = (float) ($p['pension_employee_rate']  ?? 0.04);
        $solidarityRate     = (float) ($p['solidarity_fund_rate']   ?? 0.01);
        $healthErRate       = (float) ($p['health_employer_rate']   ?? 0.085);
        $pensionErRate      = (float) ($p['pension_employer_rate']  ?? 0.12);
        $senaRate           = (float) ($p['sena_rate']              ?? 0.02);
        $icbfRate           = (float) ($p['icbf_rate']              ?? 0.03);
        $cajaRate           = (float) ($p['caja_rate']              ?? 0.04);
        $primaRate          = (float) ($p['prima_rate']             ?? 0.0833);
        $cesantiasRate      = (float) ($p['cesantias_rate']         ?? 0.0833);
        $intCesRate         = (float) ($p['int_cesantias_rate']     ?? 0.12);
        $vacacionesRate     = (float) ($p['vacaciones_rate']        ?? 0.0417);

        // ─── Cálculo ──────────────────────────────────────────────────────────

        $proportionalSalary = round($baseSalary / 30 * $workedDays, 2);

        $transport = 0.0;
        if ($baseSalary <= $transportThreshold) {
            $transport = round($transportAllowance / 30 * $workedDays, 2);
        }

        $totalGross      = $proportionalSalary + $transport + $overtimePay + $bonuses + $commissions;
        $cotizationBase  = max(
            $proportionalSalary + $overtimePay + $commissions,
            $smlmv / 30 * $workedDays
        );

        // Deducciones empleado
        $healthEmployee  = round($cotizationBase * $healthEmpRate, 2);
        $pensionEmployee = round($cotizationBase * $pensionEmpRate, 2);
        $solidarityFund  = $cotizationBase >= $solidarityThreshold
            ? round($cotizationBase * $solidarityRate, 2) : 0.0;

        $totalDeductions = $healthEmployee + $pensionEmployee + $solidarityFund + $otherDeductions;
        $netPay          = $totalGross - $totalDeductions;

        // Aportes empleador
        $arlRate         = (float) ($arlRates[(string)$arlRisk] ?? $arlRates['1'] ?? 0.00522);
        $healthEmployer  = round($cotizationBase * $healthErRate, 2);
        $pensionEmployer = round($cotizationBase * $pensionErRate, 2);
        $arl             = round($cotizationBase * $arlRate, 2);
        $sena            = round($cotizationBase * $senaRate, 2);
        $icbf            = round($cotizationBase * $icbfRate, 2);
        $caja            = round($cotizationBase * $cajaRate, 2);
        $totalEmployerCost = $healthEmployer + $pensionEmployer + $arl + $sena + $icbf + $caja;

        // Provisiones
        $provisionBase       = $proportionalSalary + $transport;
        $primaProvision      = round($provisionBase * $primaRate, 2);
        $cesantiasProvision  = round($provisionBase * $cesantiasRate, 2);
        $intCesantias        = round($cesantiasProvision * ($intCesRate / 12), 2);
        $vacacionesProvision = round($proportionalSalary * $vacacionesRate, 2);

        return [
            'base_salary'            => $proportionalSalary,
            'transport_allowance'    => $transport,
            'overtime_pay'           => $overtimePay,
            'bonuses'                => $bonuses,
            'commissions'            => $commissions,
            'total_gross'            => $totalGross,
            'health_employee'        => $healthEmployee,
            'pension_employee'       => $pensionEmployee,
            'solidarity_fund'        => $solidarityFund,
            'other_deductions'       => $otherDeductions,
            'total_deductions'       => $totalDeductions,
            'net_pay'                => $netPay,
            'health_employer'        => $healthEmployer,
            'pension_employer'       => $pensionEmployer,
            'arl'                    => $arl,
            'sena'                   => $sena,
            'icbf'                   => $icbf,
            'caja'                   => $caja,
            'total_employer_cost'    => $totalEmployerCost,
            'prima_provision'        => $primaProvision,
            'cesantias_provision'    => $cesantiasProvision,
            'intereses_cesantias'    => $intCesantias,
            'vacaciones_provision'   => $vacacionesProvision,
            'cotization_base'        => $cotizationBase,
            'worked_days'            => $workedDays,
            'arl_risk_class'         => $arlRisk,
            'smlmv_used'             => $smlmv,
            'total_cost_employee'    => $totalGross + $totalEmployerCost
                                      + $primaProvision + $cesantiasProvision
                                      + $intCesantias + $vacacionesProvision,
        ];
    }
}
