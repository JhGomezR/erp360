<?php

namespace App\Tenant\HRM\Services;

use Illuminate\Support\Facades\DB;

/**
 * Servicio de Nómina Electrónica DIAN (Resolución 000013/2021)
 *
 * Genera el XML UBL NominaIndividual por empleado.
 * En producción: firmar con el certificado digital del proveedor habilitado
 * y enviar al WS DIAN usando el AccessToken del software.
 */
class NominaElectronicaService
{
    /**
     * Genera y persiste los documentos NE-DIAN para todos los ítems de un período.
     *
     * @return array{ generated: int, skipped: int }
     */
    public static function generateForPeriod(int $periodId): array
    {
        $period = DB::table('payroll_periods')->find($periodId);
        if (!$period) {
            throw new \Exception("Período #{$periodId} no encontrado.");
        }

        $config = DB::table('dian_configs')->first();

        $items = DB::table('payroll_items as pi')
            ->join('employees as e', 'e.id', '=', 'pi.employee_id')
            ->where('pi.payroll_period_id', $periodId)
            ->select('pi.*', 'e.full_name', 'e.document_number', 'e.document_type',
                     'e.email', 'e.position', 'e.department', 'e.bank_name',
                     'e.bank_account_number', 'e.bank_account_type')
            ->get();

        $generated = 0;
        $skipped   = 0;

        foreach ($items as $item) {
            // Skip if already accepted by DIAN
            $existing = DB::table('payroll_electronic_docs')
                ->where('payroll_period_id', $periodId)
                ->where('employee_id', $item->employee_id)
                ->first();

            if ($existing && $existing->status === 'accepted') {
                $skipped++;
                continue;
            }

            $doc = self::buildDocument($item, $period, $config);

            if ($existing) {
                DB::table('payroll_electronic_docs')->where('id', $existing->id)->update([
                    'cune'               => $doc['cune'],
                    'consecutivo'        => $doc['consecutivo'],
                    'xml_content'        => $doc['xml'],
                    'devengados_total'   => $doc['devengados'],
                    'deducciones_total'  => $doc['deducciones'],
                    'total_comprobante'  => $doc['total'],
                    'status'             => 'generated',
                    'updated_at'         => now(),
                ]);
            } else {
                DB::table('payroll_electronic_docs')->insert([
                    'payroll_period_id'  => $periodId,
                    'payroll_item_id'    => $item->id,
                    'employee_id'        => $item->employee_id,
                    'cune'               => $doc['cune'],
                    'consecutivo'        => $doc['consecutivo'],
                    'tipo_nota'          => 'NI',
                    'xml_content'        => $doc['xml'],
                    'devengados_total'   => $doc['devengados'],
                    'deducciones_total'  => $doc['deducciones'],
                    'total_comprobante'  => $doc['total'],
                    'status'             => 'generated',
                    'created_at'         => now(),
                    'updated_at'         => now(),
                ]);
            }

            $generated++;
        }

        return compact('generated', 'skipped');
    }

    /**
     * Devuelve el XML generado para un documento específico.
     */
    public static function getXml(int $docId): string
    {
        $doc = DB::table('payroll_electronic_docs')->find($docId);
        if (!$doc || !$doc->xml_content) {
            throw new \Exception("Documento #{$docId} no tiene XML generado.");
        }
        return $doc->xml_content;
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private static function buildDocument(object $item, object $period, ?object $config): array
    {
        $empNit   = $config?->nit ?? 'NO_CONFIGURADO';
        $razon    = $config?->razon_social ?? 'EMPRESA';
        $softPin  = $config?->soft_pin ?? '';

        // Devengados
        $salarioBasico  = (float) ($item->base_salary ?? 0);
        $auxilioTrans   = (float) ($item->transport_subsidy ?? 0);
        $horasExtra     = (float) ($item->overtime_pay ?? 0);
        $bonificaciones = (float) ($item->bonuses ?? 0);
        $comisiones     = (float) ($item->commissions ?? 0);
        $otrosDevengados= (float) ($item->other_income ?? 0);
        $devengados     = $salarioBasico + $auxilioTrans + $horasExtra + $bonificaciones + $comisiones + $otrosDevengados;

        // Deducciones
        $saludEmpleado  = (float) ($item->health_employee ?? 0);
        $pensionEmpleado= (float) ($item->pension_employee ?? 0);
        $otrasDeduc     = (float) ($item->other_deductions ?? 0);
        $prestamos      = (float) ($item->loan_deductions ?? 0);
        $deducciones    = $saludEmpleado + $pensionEmpleado + $otrasDeduc + $prestamos;

        $totalComp  = round($devengados - $deducciones, 2);
        $fecha      = now()->toDateString();
        $consecutivo = strtoupper(substr(md5($item->employee_id . $period->id . microtime()), 0, 10));

        // CUNE: SHA-384 de campos obligatorios (spec DIAN)
        $cune = hash('sha384', implode('', [
            $consecutivo,
            $fecha,
            number_format($devengados, 2, '.', ''),
            number_format($deducciones, 2, '.', ''),
            number_format($totalComp, 2, '.', ''),
            $item->document_number,
            $empNit,
            $softPin,
            '2', // TipoNota: 2 = NominaIndividual
        ]));

        $xml = self::buildXml([
            'consecutivo'     => $consecutivo,
            'cune'            => $cune,
            'fecha'           => $fecha,
            'period_from'     => $period->date_from ?? $period->period_start ?? '',
            'period_to'       => $period->date_to   ?? $period->period_end ?? '',
            'employer_nit'    => $empNit,
            'razon_social'    => htmlspecialchars((string) $razon),
            'emp_doc_type'    => $item->document_type ?? 'CC',
            'emp_document'    => $item->document_number,
            'emp_name'        => htmlspecialchars((string) $item->full_name),
            'emp_position'    => htmlspecialchars((string) ($item->position ?? '')),
            'salario_basico'  => number_format($salarioBasico, 2, '.', ''),
            'auxilio_trans'   => number_format($auxilioTrans, 2, '.', ''),
            'horas_extra'     => number_format($horasExtra, 2, '.', ''),
            'bonificaciones'  => number_format($bonificaciones, 2, '.', ''),
            'comisiones'      => number_format($comisiones, 2, '.', ''),
            'salud_empleado'  => number_format($saludEmpleado, 2, '.', ''),
            'pension_empleado'=> number_format($pensionEmpleado, 2, '.', ''),
            'otras_deduc'     => number_format($otrasDeduc, 2, '.', ''),
            'prestamos'       => number_format($prestamos, 2, '.', ''),
            'devengados_total'=> number_format($devengados, 2, '.', ''),
            'deduc_total'     => number_format($deducciones, 2, '.', ''),
            'total_comp'      => number_format($totalComp, 2, '.', ''),
        ]);

        return [
            'cune'        => $cune,
            'consecutivo' => $consecutivo,
            'xml'         => $xml,
            'devengados'  => round($devengados, 2),
            'deducciones' => round($deducciones, 2),
            'total'       => $totalComp,
        ];
    }

    private static function buildXml(array $d): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<NominaIndividual xmlns="dian:gov:co:facturaelectronica:NominaIndividual"
    xmlns:xs="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="dian:gov:co:facturaelectronica:NominaIndividual NominaIndividualElectronica.xsd"
    sch:schemaVersion="V1.0:NOMINA_ELECTRONICA_V1.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:sch="dian:gov:co:facturaelectronica:Schemas">

  <InformacionGeneral
    Version="V1.0:NOMINA_ELECTRONICA_V1.0"
    Ambiente="2"
    TipoXML="102"
    CUNE="{$d['cune']}"
    EncripCUNE="SHA-384"
    FechaGen="{$d['fecha']}"
    PeriodoNomina="Mensual"
    FechaIngreso=""
    FechaLiquidacionInicio="{$d['period_from']}"
    FechaLiquidacionFin="{$d['period_to']}"
    TiempoLaborado="30"
    FechasPagos="{$d['fecha']}" />

  <Empleador
    NIT="{$d['employer_nit']}"
    RazonSocial="{$d['razon_social']}"
    Pais="CO"
    DepartamentoEstado="11"
    MunicipioCiudad="001"
    Direccion="" />

  <Trabajador
    TipoTrabajador="01"
    SubTipoTrabajador="00"
    AltoRiesgoPension="false"
    TipoDocumento="{$d['emp_doc_type']}"
    NumeroDocumento="{$d['emp_document']}"
    PrimerApellido=""
    SegundoApellido=""
    PrimerNombre=""
    NombresCC="{$d['emp_name']}"
    LugarTrabajoPais="CO"
    LugarTrabajoDepartamentoEstado="11"
    LugarTrabajoMunicipioCiudad="001"
    LugarTrabajoDireccion=""
    SalarioIntegral="false"
    TipoContrato="1"
    Sueldo="{$d['salario_basico']}"
    CodigoTrabajador="{$d['emp_document']}" />

  <Devengados>
    <Basico DiasTrabajados="30" SueldoTrabajado="{$d['salario_basico']}" />
    <Transporte AuxilioTransporte="{$d['auxilio_trans']}" ViaticosManuAlim="0.00" ViaticosNoManuAlim="0.00" />
    <HEDs Cantidad="0" Porcentaje="0.00" Pago="{$d['horas_extra']}" />
    <Bonificaciones BonificacionSalarial="{$d['bonificaciones']}" BonificacionNS="0.00" />
    <Comisiones Comision="{$d['comisiones']}" />
    <DevengadosTotal>{$d['devengados_total']}</DevengadosTotal>
  </Devengados>

  <Deducciones>
    <Salud PorcentajeEmpleado="4.00" DeduccionEmpleado="{$d['salud_empleado']}" />
    <FondoPension PorcentajeEmpleado="4.00" DeduccionEmpleado="{$d['pension_empleado']}" />
    <PagoTercero Deduccion="{$d['otras_deduc']}" />
    <Embargo Deduccion="{$d['prestamos']}" />
    <DeduccionesTotal>{$d['deduc_total']}</DeduccionesTotal>
  </Deducciones>

  <DevengadosTotal>{$d['devengados_total']}</DevengadosTotal>
  <DeduccionesTotal>{$d['deduc_total']}</DeduccionesTotal>
  <ComprobanteTotal>{$d['total_comp']}</ComprobanteTotal>

  <!-- Número: {$d['consecutivo']} -->
  <!-- NOTA: Documento stub — firmar con certificado digital y enviar al WS DIAN en producción. -->
</NominaIndividual>
XML;
    }
}
