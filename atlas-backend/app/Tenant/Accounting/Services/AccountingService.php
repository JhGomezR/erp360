<?php

namespace App\Tenant\Accounting\Services;

use App\Tenant\Accounting\Models\Account;
use App\Tenant\Accounting\Models\JournalEntry;
use Illuminate\Support\Facades\DB;

/**
 * Servicio de contabilidad:
 * - Crea asientos automáticos desde ventas, compras y devoluciones.
 * - Recupera cuentas por código PUC (con fallback a la cuenta genérica más cercana).
 */
class AccountingService
{
    // Códigos PUC Colombia estándar usados en el auto-posting
    private const ACCOUNTS = [
        'caja'              => '1105',  // Caja general
        'bancos'            => '1110',  // Bancos
        'cuentas_cobrar'    => '1305',  // Clientes
        'inventario'        => '1435',  // Mercancías no fabricadas por la empresa
        'iva_generado'      => '2408',  // IVA por pagar (generado en ventas)
        'iva_descontable'   => '2365',  // IVA descontable (en compras)
        'retefuente_por_pagar' => '2365', // Retención en la fuente por pagar
        'ingresos_ventas'   => '4135',  // Comercio al por mayor y al por menor
        'costo_ventas'      => '6135',  // Costo de ventas - comercio
        'cuentas_pagar'     => '2205',  // Proveedores
        'compras'           => '1435',  // Inventario (misma cuenta en compras)
        'devoluciones_ventas'  => '4175', // Devoluciones en ventas
        'devoluciones_compras' => '6175', // Devoluciones en compras
        // Gastos
        'gastos_admin'         => '5105', // Gastos de administración
        'gastos_ventas'        => '5205', // Gastos de ventas
        // Nómina
        'gastos_nomina'        => '5105', // Salarios y jornales (administración)
        'gastos_aportes_patron'=> '5160', // Aportes sobre la nómina (parafiscales empleador)
        'nominas_por_pagar'    => '2505', // Salarios por pagar
        'deducciones_empleado' => '2365', // Retenciones y deducciones de empleados
        'aportes_patronales_cp'=> '2550', // Aportes parafiscales por pagar
    ];

    // ─── Auto-posting de ventas ───────────────────────────────────────────────

    /**
     * Genera el asiento contable de una venta.
     *
     * Débito:  Caja/Banco   (total)
     * Crédito: Ingresos     (subtotal sin IVA)
     *          IVA generado (impuestos)
     * + asiento de costo:
     * Débito:  Costo ventas (costo mercancía)
     * Crédito: Inventario   (costo mercancía)
     */
    public function postSale(
        int    $saleId,
        float  $total,
        float  $subtotal,
        float  $tax,
        float  $costAmount,
        string $description,
        int    $userId,
        string $date,
    ): ?JournalEntry {
        $lines = [];

        // Débito: Caja
        $lines[] = $this->buildLine('caja', $total, 0, 'Cobro venta');

        // Crédito: Ingresos
        $lines[] = $this->buildLine('ingresos_ventas', 0, $subtotal, 'Ingreso venta');

        // Crédito: IVA generado (solo si hay impuesto)
        if ($tax > 0) {
            $lines[] = $this->buildLine('iva_generado', 0, $tax, 'IVA generado');
        }

        $entry = $this->createEntry('sale', $saleId, $date, $description, $userId, $lines);

        // Asiento de costo (si se provee)
        if ($costAmount > 0 && $entry) {
            $costLines = [
                $this->buildLine('costo_ventas', $costAmount, 0, 'Costo de ventas'),
                $this->buildLine('inventario',   0, $costAmount, 'Salida de inventario'),
            ];
            $this->createEntry('sale', $saleId, $date, "Costo - {$description}", $userId, $costLines);
        }

        return $entry;
    }

    /**
     * Genera el asiento de una compra.
     *
     * Débito:  Inventario (subtotal)
     *          IVA descontable (impuesto)
     * Crédito: Cuentas x pagar (total)
     */
    public function postPurchase(
        int    $purchaseId,
        float  $total,
        float  $subtotal,
        float  $tax,
        string $description,
        int    $userId,
        string $date,
    ): ?JournalEntry {
        $lines = [
            $this->buildLine('inventario',        $subtotal, 0,     'Entrada inventario'),
            $this->buildLine('iva_descontable',   $tax,      0,     'IVA descontable'),
            $this->buildLine('cuentas_pagar',     0,         $total,'Deuda con proveedor'),
        ];

        return $this->createEntry('purchase', $purchaseId, $date, $description, $userId, $lines);
    }

    /**
     * Genera el asiento de una devolución en venta.
     * Reversa el ingreso y devuelve el IVA.
     */
    public function postSaleReturn(
        int    $returnId,
        float  $total,
        float  $subtotal,
        float  $tax,
        string $description,
        int    $userId,
        string $date,
    ): ?JournalEntry {
        $lines = [
            $this->buildLine('devoluciones_ventas', $subtotal, 0,      'Devolución venta'),
            $this->buildLine('iva_generado',        $tax,      0,      'IVA reversado'),
            $this->buildLine('caja',                0,         $total, 'Reembolso al cliente'),
        ];

        return $this->createEntry('sale_return', $returnId, $date, $description, $userId, $lines);
    }

    // ─── Auto-posting de gastos ───────────────────────────────────────────────

    /**
     * Genera el asiento contable al pagar un gasto.
     *
     * Débito:  Gastos administración  (amount)
     *          IVA descontable        (tax, si aplica)
     * Crédito: Caja / Bancos          (total)
     */
    public function postExpense(
        int    $expenseId,
        float  $total,
        float  $amount,
        float  $tax,
        string $paymentMethod,
        string $description,
        int    $userId,
        string $date,
    ): ?JournalEntry {
        $cashAccount = $paymentMethod === 'cash' ? 'caja' : 'bancos';

        $lines = [
            $this->buildLine('gastos_admin', $amount, 0, 'Gasto'),
        ];

        if ($tax > 0) {
            $lines[] = $this->buildLine('iva_descontable', $tax, 0, 'IVA descontable gasto');
        }

        $lines[] = $this->buildLine($cashAccount, 0, $total, 'Pago gasto');

        return $this->createEntry('expense', $expenseId, $date, $description, $userId, $lines);
    }

    // ─── Auto-posting de nómina ───────────────────────────────────────────────

    /**
     * Genera el asiento contable al cerrar/pagar una nómina.
     *
     * Débito:  Gastos de personal        (total_gross)
     *          Aportes patronales        (total_employer_cost - total_gross... solo parafiscales)
     * Crédito: Nóminas por pagar         (total_net)
     *          Deducciones empleado      (total_deductions)
     *          Costo empleador patronal  (total_employer_cost - total_net - total_deductions)
     */
    public function postPayroll(
        int    $periodId,
        float  $totalGross,
        float  $totalDeductions,
        float  $totalNet,
        float  $totalEmployerCost,
        string $description,
        int    $userId,
        string $date,
    ): ?JournalEntry {
        $employerContributions = round($totalEmployerCost - $totalGross, 2);
        if ($employerContributions < 0) {
            $employerContributions = 0;
        }

        $lines = [
            // Débitos
            $this->buildLine('gastos_nomina',          $totalGross,           0,             'Gasto nómina devengado'),
            $this->buildLine('gastos_aportes_patron',  $employerContributions, 0,            'Aportes patronales'),
            // Créditos
            $this->buildLine('nominas_por_pagar',      0, $totalNet,                         'Nóminas por pagar'),
            $this->buildLine('deducciones_empleado',   0, $totalDeductions,                  'Deducciones empleado'),
            $this->buildLine('aportes_patronales_cp',  0, $employerContributions,            'Aportes patronales por pagar'),
        ];

        return $this->createEntry('payroll', $periodId, $date, $description, $userId, $lines);
    }

    // ─── Plan de cuentas ─────────────────────────────────────────────────────

    /**
     * Siembra el PUC básico Colombia (clases y grupos principales).
     * Se llama al activar el módulo de contabilidad.
     */
    public function seedBasicPUC(): void
    {
        $puc = $this->basicPucData();

        foreach ($puc as $row) {
            $existing = Account::where('code', $row['code'])->first();

            if ($existing) {
                continue;
            }

            $parent = null;
            if (strlen($row['code']) > 1) {
                // Buscar el padre: código con un dígito menos al final
                $parentCode = $this->getParentCode($row['code']);
                $parent     = Account::where('code', $parentCode)->first();
            }

            Account::create([
                'code'           => $row['code'],
                'name'           => $row['name'],
                'type'           => $row['type'],
                'nature'         => $row['nature'],
                'parent_id'      => $parent?->id,
                'level'          => strlen($row['code']) <= 1 ? 1 : (strlen($row['code']) <= 2 ? 2 : 3),
                'accepts_entries'=> strlen($row['code']) >= 4,
            ]);
        }
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    private function buildLine(string $accountKey, float $debit, float $credit, string $desc): array
    {
        $code    = self::ACCOUNTS[$accountKey];
        $account = Account::where('code', 'LIKE', $code . '%')
            ->where('accepts_entries', true)
            ->orderBy('code')
            ->first();

        return [
            'account_id'   => $account?->id,
            'account_code' => $account?->code ?? $code,
            'account_name' => $account?->name ?? $accountKey,
            'debit'        => round($debit, 2),
            'credit'       => round($credit, 2),
            'description'  => $desc,
        ];
    }

    private function createEntry(
        string $source,
        int    $sourceId,
        string $date,
        string $description,
        int    $userId,
        array  $lines
    ): ?JournalEntry {
        // No crear asiento si no hay cuentas configuradas
        if (collect($lines)->every(fn($l) => $l['account_id'] === null)) {
            return null;
        }

        return DB::transaction(function () use ($source, $sourceId, $date, $description, $userId, $lines) {
            $entry = JournalEntry::create([
                'entry_date'  => $date,
                'description' => $description,
                'status'      => 'posted',
                'source'      => $source,
                'source_id'   => $sourceId,
                'created_by'  => $userId,
                'posted_by'   => $userId,
                'posted_at'   => now(),
            ]);

            foreach ($lines as $line) {
                // Omitir líneas sin cuenta asignada (PUC no sembrado para este código)
                if ($line['account_id'] === null) {
                    continue;
                }
                $entry->lines()->create($line);
            }

            return $entry;
        });
    }

    private function getParentCode(string $code): string
    {
        // 1105 → 11, 11 → 1, 41 → 4
        if (strlen($code) === 4) return substr($code, 0, 2);
        if (strlen($code) === 2) return substr($code, 0, 1);
        return substr($code, 0, strlen($code) - 1);
    }

    // ─── PUC Colombia completo ───────────────────────────────────────────────────

    private function basicPucData(): array
    {
        return [
            // ════════════════════════════════════════════════════════════════
            // CLASE 1 — ACTIVO
            // ════════════════════════════════════════════════════════════════
            ['code'=>'1',    'name'=>'ACTIVO',                                         'type'=>'asset','nature'=>'debit'],
            // Grupo 11 - Disponible
            ['code'=>'11',   'name'=>'Disponible',                                     'type'=>'asset','nature'=>'debit'],
            ['code'=>'1105', 'name'=>'Caja',                                           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1110', 'name'=>'Bancos',                                         'type'=>'asset','nature'=>'debit'],
            ['code'=>'1115', 'name'=>'Remesas en transito',                            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1120', 'name'=>'Cuentas de ahorro',                              'type'=>'asset','nature'=>'debit'],
            // Grupo 12 - Inversiones
            ['code'=>'12',   'name'=>'Inversiones',                                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1205', 'name'=>'Acciones',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1210', 'name'=>'Cuotas o partes de interes social',              'type'=>'asset','nature'=>'debit'],
            ['code'=>'1225', 'name'=>'Titulos valores',                                'type'=>'asset','nature'=>'debit'],
            ['code'=>'1255', 'name'=>'Derechos fiduciarios',                           'type'=>'asset','nature'=>'debit'],
            // Grupo 13 - Deudores
            ['code'=>'13',   'name'=>'Deudores',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1305', 'name'=>'Clientes',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1310', 'name'=>'Cuentas corrientes comerciales',                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1320', 'name'=>'Deudores varios',                                'type'=>'asset','nature'=>'debit'],
            ['code'=>'1330', 'name'=>'Anticipos y avances',                            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1335', 'name'=>'Depositos',                                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1340', 'name'=>'Promesas de compraventa',                        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1345', 'name'=>'Ingresos por cobrar',                            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1350', 'name'=>'Retencion sobre contratos',                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1355', 'name'=>'Prestamos a trabajadores',                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1360', 'name'=>'Prestamos a particulares',                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1365', 'name'=>'Cuentas por cobrar a socios y accionistas',      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1370', 'name'=>'Cuentas por cobrar a directores',                'type'=>'asset','nature'=>'debit'],
            ['code'=>'1380', 'name'=>'Deudas de dificil cobro',                        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1385', 'name'=>'Provision deudores - deudas de dificil cobro',   'type'=>'asset','nature'=>'credit'],
            // Grupo 14 - Inventarios
            ['code'=>'14',   'name'=>'Inventarios',                                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1405', 'name'=>'Materias primas',                                'type'=>'asset','nature'=>'debit'],
            ['code'=>'1410', 'name'=>'Productos en proceso',                           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1415', 'name'=>'Obras de construccion en curso',                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1420', 'name'=>'Contratos en ejecucion',                         'type'=>'asset','nature'=>'debit'],
            ['code'=>'1425', 'name'=>'Cultivos y plantaciones',                        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1428', 'name'=>'Materiales, repuestos y accesorios',             'type'=>'asset','nature'=>'debit'],
            ['code'=>'1430', 'name'=>'Productos terminados',                           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1435', 'name'=>'Mercancias no fabricadas por la empresa',        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1440', 'name'=>'Bienes raices para la venta',                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1455', 'name'=>'Semovientes',                                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1460', 'name'=>'Envases y empaques',                             'type'=>'asset','nature'=>'debit'],
            ['code'=>'1465', 'name'=>'Inventarios en transito',                        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1480', 'name'=>'Provision proteccion de inventarios',            'type'=>'asset','nature'=>'credit'],
            // Grupo 15 - Propiedades planta y equipo
            ['code'=>'15',   'name'=>'Propiedades planta y equipo',                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1504', 'name'=>'Terrenos',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1508', 'name'=>'Construcciones y edificaciones',                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1512', 'name'=>'Maquinaria y equipo',                            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1516', 'name'=>'Equipo de oficina',                              'type'=>'asset','nature'=>'debit'],
            ['code'=>'1520', 'name'=>'Equipo de computacion y comunicacion',           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1524', 'name'=>'Equipo medico cientifico',                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1528', 'name'=>'Equipo de hoteles y restaurantes',               'type'=>'asset','nature'=>'debit'],
            ['code'=>'1532', 'name'=>'Equipo de transporte',                           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1536', 'name'=>'Equipo de vigilancia y seguridad',               'type'=>'asset','nature'=>'debit'],
            ['code'=>'1540', 'name'=>'Flota y equipo aereo',                           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1548', 'name'=>'Flota y equipo fluvial y maritimo',              'type'=>'asset','nature'=>'debit'],
            ['code'=>'1560', 'name'=>'Acueducto, planta y redes',                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1564', 'name'=>'Vias, comunicaciones y obras afines',            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1568', 'name'=>'Construccion y edificaciones',                   'type'=>'asset','nature'=>'debit'],
            ['code'=>'1572', 'name'=>'Minas y canteras',                               'type'=>'asset','nature'=>'debit'],
            ['code'=>'1592', 'name'=>'Depreciacion acumulada - propiedades',           'type'=>'asset','nature'=>'credit'],
            ['code'=>'1599', 'name'=>'Provisiones',                                    'type'=>'asset','nature'=>'credit'],
            // Grupo 16 - Intangibles
            ['code'=>'16',   'name'=>'Intangibles',                                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1605', 'name'=>'Credito mercantil',                              'type'=>'asset','nature'=>'debit'],
            ['code'=>'1610', 'name'=>'Marcas',                                         'type'=>'asset','nature'=>'debit'],
            ['code'=>'1615', 'name'=>'Patentes',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1620', 'name'=>'Know how',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1625', 'name'=>'Franquicias',                                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'1630', 'name'=>'Licencias',                                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1635', 'name'=>'Derechos',                                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1640', 'name'=>'Good will',                                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1645', 'name'=>'Know how adquirido',                             'type'=>'asset','nature'=>'debit'],
            ['code'=>'1695', 'name'=>'Amortizacion acumulada - intangibles',           'type'=>'asset','nature'=>'credit'],
            // Grupo 17 - Diferidos
            ['code'=>'17',   'name'=>'Diferidos',                                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'1705', 'name'=>'Gastos pagados por anticipado',                  'type'=>'asset','nature'=>'debit'],
            ['code'=>'1710', 'name'=>'Cargos diferidos',                               'type'=>'asset','nature'=>'debit'],
            ['code'=>'1715', 'name'=>'Costos de exploracion por amortizar',            'type'=>'asset','nature'=>'debit'],
            ['code'=>'1720', 'name'=>'Costos de establecimiento por amortizar',        'type'=>'asset','nature'=>'debit'],
            ['code'=>'1725', 'name'=>'Programas para computador (software)',           'type'=>'asset','nature'=>'debit'],
            ['code'=>'1730', 'name'=>'Intangibles adquiridos diferidos',               'type'=>'asset','nature'=>'debit'],
            // Grupo 18 - Otros activos
            ['code'=>'18',   'name'=>'Otros activos',                                  'type'=>'asset','nature'=>'debit'],
            ['code'=>'1805', 'name'=>'Bienes de arte y cultura',                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1810', 'name'=>'Bienes recibidos en pago',                       'type'=>'asset','nature'=>'debit'],
            ['code'=>'1815', 'name'=>'Bienes entregados en comodato',                  'type'=>'asset','nature'=>'debit'],
            ['code'=>'1820', 'name'=>'Bienes entregados en arrendamiento',             'type'=>'asset','nature'=>'debit'],
            // Grupo 19 - Valorizaciones
            ['code'=>'19',   'name'=>'Valorizaciones',                                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1905', 'name'=>'De inversiones',                                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1910', 'name'=>'De propiedades planta y equipo',                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'1995', 'name'=>'De otros activos',                               'type'=>'asset','nature'=>'debit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 2 — PASIVO
            // ════════════════════════════════════════════════════════════════
            ['code'=>'2',    'name'=>'PASIVO',                                         'type'=>'liability','nature'=>'credit'],
            // Grupo 21 - Obligaciones financieras
            ['code'=>'21',   'name'=>'Obligaciones financieras',                       'type'=>'liability','nature'=>'credit'],
            ['code'=>'2105', 'name'=>'Bancos nacionales',                              'type'=>'liability','nature'=>'credit'],
            ['code'=>'2110', 'name'=>'Bancos del exterior',                            'type'=>'liability','nature'=>'credit'],
            ['code'=>'2115', 'name'=>'Corporaciones financieras',                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2120', 'name'=>'Companias de financiamiento comercial',          'type'=>'liability','nature'=>'credit'],
            ['code'=>'2125', 'name'=>'Cooperativas',                                   'type'=>'liability','nature'=>'credit'],
            ['code'=>'2145', 'name'=>'Otras obligaciones',                             'type'=>'liability','nature'=>'credit'],
            // Grupo 22 - Proveedores
            ['code'=>'22',   'name'=>'Proveedores',                                    'type'=>'liability','nature'=>'credit'],
            ['code'=>'2205', 'name'=>'Proveedores nacionales',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2210', 'name'=>'Proveedores del exterior',                       'type'=>'liability','nature'=>'credit'],
            // Grupo 23 - Cuentas por pagar
            ['code'=>'23',   'name'=>'Cuentas por pagar',                              'type'=>'liability','nature'=>'credit'],
            ['code'=>'2305', 'name'=>'Cuentas corrientes comerciales',                 'type'=>'liability','nature'=>'credit'],
            ['code'=>'2315', 'name'=>'A companias vinculadas',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2320', 'name'=>'A socios y accionistas',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2325', 'name'=>'A directores',                                   'type'=>'liability','nature'=>'credit'],
            ['code'=>'2330', 'name'=>'A administradores',                              'type'=>'liability','nature'=>'credit'],
            ['code'=>'2335', 'name'=>'Nomina por pagar',                               'type'=>'liability','nature'=>'credit'],
            ['code'=>'2340', 'name'=>'Costos y gastos por pagar',                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2345', 'name'=>'Instalamentos por pagar',                        'type'=>'liability','nature'=>'credit'],
            ['code'=>'2350', 'name'=>'Arrendamientos',                                 'type'=>'liability','nature'=>'credit'],
            ['code'=>'2355', 'name'=>'Servicios publicos',                             'type'=>'liability','nature'=>'credit'],
            ['code'=>'2360', 'name'=>'Dividendos o participaciones por pagar',         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2365', 'name'=>'Retencion en la fuente',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2367', 'name'=>'Impuesto a las ventas retenido (ReteIVA)',       'type'=>'liability','nature'=>'credit'],
            ['code'=>'2368', 'name'=>'Impuesto de industria y comercio retenido (ICA)','type'=>'liability','nature'=>'credit'],
            ['code'=>'2370', 'name'=>'Retencion impuesto de industria y comercio',     'type'=>'liability','nature'=>'credit'],
            ['code'=>'2380', 'name'=>'Acreedores varios',                              'type'=>'liability','nature'=>'credit'],
            ['code'=>'2390', 'name'=>'Otros',                                          'type'=>'liability','nature'=>'credit'],
            // Grupo 24 - Impuestos, gravamenes y tasas
            ['code'=>'24',   'name'=>'Impuestos gravamenes y tasas',                   'type'=>'liability','nature'=>'credit'],
            ['code'=>'2404', 'name'=>'Impuesto de renta y complementarios',            'type'=>'liability','nature'=>'credit'],
            ['code'=>'2408', 'name'=>'Impuesto sobre las ventas por pagar (IVA)',      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2412', 'name'=>'Impuesto de industria y comercio',               'type'=>'liability','nature'=>'credit'],
            ['code'=>'2416', 'name'=>'Impuesto predial unificado',                     'type'=>'liability','nature'=>'credit'],
            ['code'=>'2420', 'name'=>'Impuesto al consumo (ICO)',                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2424', 'name'=>'Impuesto a la riqueza',                          'type'=>'liability','nature'=>'credit'],
            ['code'=>'2436', 'name'=>'Otros impuestos',                                'type'=>'liability','nature'=>'credit'],
            // Grupo 25 - Obligaciones laborales
            ['code'=>'25',   'name'=>'Obligaciones laborales',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2505', 'name'=>'Salarios por pagar',                             'type'=>'liability','nature'=>'credit'],
            ['code'=>'2510', 'name'=>'Cesantias consolidadas',                         'type'=>'liability','nature'=>'credit'],
            ['code'=>'2515', 'name'=>'Intereses sobre cesantias',                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2520', 'name'=>'Prima de servicios',                             'type'=>'liability','nature'=>'credit'],
            ['code'=>'2525', 'name'=>'Vacaciones consolidadas',                        'type'=>'liability','nature'=>'credit'],
            ['code'=>'2530', 'name'=>'Prestaciones extralegales',                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2535', 'name'=>'Pensiones de jubilacion',                        'type'=>'liability','nature'=>'credit'],
            ['code'=>'2540', 'name'=>'Indemnizaciones laborales',                      'type'=>'liability','nature'=>'credit'],
            // Grupo 26 - Pasivos estimados y provisiones
            ['code'=>'26',   'name'=>'Pasivos estimados y provisiones',                'type'=>'liability','nature'=>'credit'],
            ['code'=>'2605', 'name'=>'Para costos y gastos',                           'type'=>'liability','nature'=>'credit'],
            ['code'=>'2610', 'name'=>'Para obligaciones fiscales',                     'type'=>'liability','nature'=>'credit'],
            ['code'=>'2615', 'name'=>'Para prestaciones sociales',                     'type'=>'liability','nature'=>'credit'],
            ['code'=>'2625', 'name'=>'Para contingencias',                             'type'=>'liability','nature'=>'credit'],
            ['code'=>'2630', 'name'=>'Para obras de urbanismo',                        'type'=>'liability','nature'=>'credit'],
            // Grupo 27 - Diferidos
            ['code'=>'27',   'name'=>'Diferidos',                                      'type'=>'liability','nature'=>'credit'],
            ['code'=>'2705', 'name'=>'Ingresos recibidos para terceros',               'type'=>'liability','nature'=>'credit'],
            ['code'=>'2710', 'name'=>'Ingresos recibidos por anticipado',              'type'=>'liability','nature'=>'credit'],
            // Grupo 28 - Otros pasivos
            ['code'=>'28',   'name'=>'Otros pasivos',                                  'type'=>'liability','nature'=>'credit'],
            ['code'=>'2805', 'name'=>'Anticipos y avances recibidos',                  'type'=>'liability','nature'=>'credit'],
            ['code'=>'2810', 'name'=>'Depositos recibidos',                            'type'=>'liability','nature'=>'credit'],
            ['code'=>'2815', 'name'=>'Ingresos recibidos por anticipado',              'type'=>'liability','nature'=>'credit'],
            ['code'=>'2820', 'name'=>'Cuotas de administracion',                       'type'=>'liability','nature'=>'credit'],
            // Grupo 29 - Bonos y papeles comerciales
            ['code'=>'29',   'name'=>'Bonos y papeles comerciales',                    'type'=>'liability','nature'=>'credit'],
            ['code'=>'2905', 'name'=>'Bonos en circulacion',                           'type'=>'liability','nature'=>'credit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 3 — PATRIMONIO
            // ════════════════════════════════════════════════════════════════
            ['code'=>'3',    'name'=>'PATRIMONIO',                                     'type'=>'equity','nature'=>'credit'],
            // Grupo 31 - Capital social
            ['code'=>'31',   'name'=>'Capital social',                                 'type'=>'equity','nature'=>'credit'],
            ['code'=>'3105', 'name'=>'Capital suscrito y pagado',                      'type'=>'equity','nature'=>'credit'],
            ['code'=>'3110', 'name'=>'Aportes sociales',                               'type'=>'equity','nature'=>'credit'],
            ['code'=>'3115', 'name'=>'Capital de personas naturales',                  'type'=>'equity','nature'=>'credit'],
            // Grupo 32 - Superavit de capital
            ['code'=>'32',   'name'=>'Superavit de capital',                           'type'=>'equity','nature'=>'credit'],
            ['code'=>'3205', 'name'=>'Prima en colocacion de acciones, cuotas o partes de interes','type'=>'equity','nature'=>'credit'],
            ['code'=>'3210', 'name'=>'Donaciones',                                     'type'=>'equity','nature'=>'credit'],
            ['code'=>'3215', 'name'=>'Credito mercantil',                              'type'=>'equity','nature'=>'credit'],
            // Grupo 33 - Reservas
            ['code'=>'33',   'name'=>'Reservas',                                       'type'=>'equity','nature'=>'credit'],
            ['code'=>'3305', 'name'=>'Reserva legal',                                  'type'=>'equity','nature'=>'credit'],
            ['code'=>'3310', 'name'=>'Para proteccion de aportes sociales',            'type'=>'equity','nature'=>'credit'],
            ['code'=>'3315', 'name'=>'Reservas estatutarias',                          'type'=>'equity','nature'=>'credit'],
            ['code'=>'3320', 'name'=>'Reservas ocasionales',                           'type'=>'equity','nature'=>'credit'],
            // Grupo 34 - Revalorizacion del patrimonio
            ['code'=>'34',   'name'=>'Revalorizacion del patrimonio',                  'type'=>'equity','nature'=>'credit'],
            ['code'=>'3405', 'name'=>'Revalorizacion del patrimonio',                  'type'=>'equity','nature'=>'credit'],
            // Grupo 36 - Resultados del ejercicio
            ['code'=>'36',   'name'=>'Resultados del ejercicio',                       'type'=>'equity','nature'=>'credit'],
            ['code'=>'3605', 'name'=>'Utilidad del ejercicio',                         'type'=>'equity','nature'=>'credit'],
            ['code'=>'3610', 'name'=>'Perdida del ejercicio',                          'type'=>'equity','nature'=>'debit'],
            // Grupo 37 - Resultados de ejercicios anteriores
            ['code'=>'37',   'name'=>'Resultados de ejercicios anteriores',            'type'=>'equity','nature'=>'credit'],
            ['code'=>'3705', 'name'=>'Utilidades acumuladas',                          'type'=>'equity','nature'=>'credit'],
            ['code'=>'3710', 'name'=>'Perdidas acumuladas',                            'type'=>'equity','nature'=>'debit'],
            // Grupo 38 - Superavit por valorizaciones
            ['code'=>'38',   'name'=>'Superavit por valorizaciones',                   'type'=>'equity','nature'=>'credit'],
            ['code'=>'3805', 'name'=>'De inversiones',                                 'type'=>'equity','nature'=>'credit'],
            ['code'=>'3810', 'name'=>'De propiedades planta y equipo',                 'type'=>'equity','nature'=>'credit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 4 — INGRESOS
            // ════════════════════════════════════════════════════════════════
            ['code'=>'4',    'name'=>'INGRESOS',                                       'type'=>'revenue','nature'=>'credit'],
            // Grupo 41 - Operacionales
            ['code'=>'41',   'name'=>'Operacionales',                                  'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4105', 'name'=>'Agricultura, ganaderia, caza y silvicultura',    'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4110', 'name'=>'Pesca',                                          'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4115', 'name'=>'Explotacion de minas y canteras',                'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4120', 'name'=>'Industrias manufactureras',                      'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4125', 'name'=>'Suministro de electricidad gas y agua',          'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4130', 'name'=>'Construccion',                                   'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4135', 'name'=>'Comercio al por mayor y al por menor',           'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4140', 'name'=>'Hoteles restaurantes y similares',               'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4145', 'name'=>'Transporte almacenamiento y comunicaciones',     'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4150', 'name'=>'Intermediacion financiera',                      'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4155', 'name'=>'Inmobiliarias y alquiler',                       'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4160', 'name'=>'Servicios de ensenanza',                         'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4165', 'name'=>'Servicios sociales y de salud',                  'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4170', 'name'=>'Otras actividades de servicios',                 'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4175', 'name'=>'Devoluciones en ventas (debito)',                'type'=>'revenue','nature'=>'debit'],
            ['code'=>'4180', 'name'=>'Descuentos comerciales en ventas (debito)',      'type'=>'revenue','nature'=>'debit'],
            // Grupo 42 - No operacionales
            ['code'=>'42',   'name'=>'No operacionales',                               'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4205', 'name'=>'Dividendos',                                     'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4210', 'name'=>'Participaciones',                                'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4215', 'name'=>'Ingresos financieros',                           'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4220', 'name'=>'Arrendamientos',                                 'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4225', 'name'=>'Comisiones',                                     'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4230', 'name'=>'Honorarios',                                     'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4235', 'name'=>'Servicios',                                      'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4240', 'name'=>'Utilidad en venta de inversiones',               'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4245', 'name'=>'Utilidad en venta de propiedades',               'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4250', 'name'=>'Recuperaciones',                                 'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4255', 'name'=>'Indemnizaciones',                                'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4260', 'name'=>'Ingresos de ejercicios anteriores',              'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4270', 'name'=>'Ingresos por diferencia en cambio',              'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4295', 'name'=>'Diversos',                                       'type'=>'revenue','nature'=>'credit'],
            // Grupo 44 - Intereses y descuentos
            ['code'=>'44',   'name'=>'Subsidios, trasferencias y otras',               'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4405', 'name'=>'Subsidios',                                      'type'=>'revenue','nature'=>'credit'],
            ['code'=>'4410', 'name'=>'Transferencias',                                 'type'=>'revenue','nature'=>'credit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 5 — GASTOS
            // ════════════════════════════════════════════════════════════════
            ['code'=>'5',    'name'=>'GASTOS',                                         'type'=>'expense','nature'=>'debit'],
            // Grupo 51 - Operacionales de administracion
            ['code'=>'51',   'name'=>'Operacionales de administracion',                'type'=>'expense','nature'=>'debit'],
            ['code'=>'5101', 'name'=>'Gastos de personal - administracion',            'type'=>'expense','nature'=>'debit'],
            ['code'=>'5105', 'name'=>'Honorarios',                                     'type'=>'expense','nature'=>'debit'],
            ['code'=>'5110', 'name'=>'Impuestos',                                      'type'=>'expense','nature'=>'debit'],
            ['code'=>'5115', 'name'=>'Arrendamientos',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5120', 'name'=>'Contribuciones y afiliaciones',                  'type'=>'expense','nature'=>'debit'],
            ['code'=>'5125', 'name'=>'Seguros',                                        'type'=>'expense','nature'=>'debit'],
            ['code'=>'5130', 'name'=>'Servicios',                                      'type'=>'expense','nature'=>'debit'],
            ['code'=>'5135', 'name'=>'Gastos legales',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5140', 'name'=>'Mantenimiento y reparaciones',                   'type'=>'expense','nature'=>'debit'],
            ['code'=>'5145', 'name'=>'Adecuacion e instalacion',                       'type'=>'expense','nature'=>'debit'],
            ['code'=>'5150', 'name'=>'Gastos de viaje',                                'type'=>'expense','nature'=>'debit'],
            ['code'=>'5155', 'name'=>'Depreciaciones',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5160', 'name'=>'Amortizaciones',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5165', 'name'=>'Provision deudas de dificil cobro',              'type'=>'expense','nature'=>'debit'],
            ['code'=>'5170', 'name'=>'Perdidas en inversiones',                        'type'=>'expense','nature'=>'debit'],
            ['code'=>'5175', 'name'=>'Gastos extraordinarios',                         'type'=>'expense','nature'=>'debit'],
            ['code'=>'5195', 'name'=>'Diversos',                                       'type'=>'expense','nature'=>'debit'],
            // Grupo 52 - Operacionales de ventas
            ['code'=>'52',   'name'=>'Operacionales de ventas',                        'type'=>'expense','nature'=>'debit'],
            ['code'=>'5201', 'name'=>'Gastos de personal - ventas',                    'type'=>'expense','nature'=>'debit'],
            ['code'=>'5205', 'name'=>'Honorarios',                                     'type'=>'expense','nature'=>'debit'],
            ['code'=>'5210', 'name'=>'Impuestos',                                      'type'=>'expense','nature'=>'debit'],
            ['code'=>'5215', 'name'=>'Arrendamientos',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5225', 'name'=>'Seguros',                                        'type'=>'expense','nature'=>'debit'],
            ['code'=>'5230', 'name'=>'Servicios',                                      'type'=>'expense','nature'=>'debit'],
            ['code'=>'5235', 'name'=>'Gastos legales',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5240', 'name'=>'Mantenimiento y reparaciones',                   'type'=>'expense','nature'=>'debit'],
            ['code'=>'5245', 'name'=>'Adecuacion e instalacion',                       'type'=>'expense','nature'=>'debit'],
            ['code'=>'5250', 'name'=>'Gastos de viaje',                                'type'=>'expense','nature'=>'debit'],
            ['code'=>'5255', 'name'=>'Depreciaciones',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5260', 'name'=>'Amortizaciones',                                 'type'=>'expense','nature'=>'debit'],
            ['code'=>'5295', 'name'=>'Diversos',                                       'type'=>'expense','nature'=>'debit'],
            // Grupo 53 - No operacionales
            ['code'=>'53',   'name'=>'No operacionales',                               'type'=>'expense','nature'=>'debit'],
            ['code'=>'5305', 'name'=>'Financieros',                                    'type'=>'expense','nature'=>'debit'],
            ['code'=>'5310', 'name'=>'Perdida en venta y retiro de bienes',            'type'=>'expense','nature'=>'debit'],
            ['code'=>'5315', 'name'=>'Gastos extraordinarios',                         'type'=>'expense','nature'=>'debit'],
            ['code'=>'5320', 'name'=>'Gastos de ejercicios anteriores',                'type'=>'expense','nature'=>'debit'],
            ['code'=>'5330', 'name'=>'Gastos por diferencia en cambio',                'type'=>'expense','nature'=>'debit'],
            ['code'=>'5395', 'name'=>'Diversos',                                       'type'=>'expense','nature'=>'debit'],
            // Grupo 54 - Impuesto de renta y complementarios
            ['code'=>'54',   'name'=>'Impuesto de renta y complementarios',            'type'=>'expense','nature'=>'debit'],
            ['code'=>'5405', 'name'=>'Impuesto de renta',                              'type'=>'expense','nature'=>'debit'],
            ['code'=>'5410', 'name'=>'Impuesto de remesas',                            'type'=>'expense','nature'=>'debit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 6 — COSTO DE VENTAS Y DE PRESTACION DE SERVICIOS
            // ════════════════════════════════════════════════════════════════
            ['code'=>'6',    'name'=>'COSTOS DE VENTAS Y DE PRESTACION DE SERVICIOS', 'type'=>'cost','nature'=>'debit'],
            ['code'=>'61',   'name'=>'Costo de ventas y operacion',                    'type'=>'cost','nature'=>'debit'],
            ['code'=>'6105', 'name'=>'Agricultura, ganaderia, caza y silvicultura',    'type'=>'cost','nature'=>'debit'],
            ['code'=>'6110', 'name'=>'Pesca',                                          'type'=>'cost','nature'=>'debit'],
            ['code'=>'6115', 'name'=>'Explotacion de minas y canteras',                'type'=>'cost','nature'=>'debit'],
            ['code'=>'6120', 'name'=>'Industrias manufactureras',                      'type'=>'cost','nature'=>'debit'],
            ['code'=>'6125', 'name'=>'Suministro electricidad gas y agua',             'type'=>'cost','nature'=>'debit'],
            ['code'=>'6130', 'name'=>'Construccion',                                   'type'=>'cost','nature'=>'debit'],
            ['code'=>'6135', 'name'=>'Comercio al por mayor y al por menor',           'type'=>'cost','nature'=>'debit'],
            ['code'=>'6140', 'name'=>'Hoteles restaurantes y similares',               'type'=>'cost','nature'=>'debit'],
            ['code'=>'6145', 'name'=>'Transporte almacenamiento y comunicaciones',     'type'=>'cost','nature'=>'debit'],
            ['code'=>'6150', 'name'=>'Intermediacion financiera',                      'type'=>'cost','nature'=>'debit'],
            ['code'=>'6155', 'name'=>'Inmobiliarias y alquiler',                       'type'=>'cost','nature'=>'debit'],
            ['code'=>'6160', 'name'=>'Servicios de ensenanza',                         'type'=>'cost','nature'=>'debit'],
            ['code'=>'6165', 'name'=>'Servicios sociales y de salud',                  'type'=>'cost','nature'=>'debit'],
            ['code'=>'6175', 'name'=>'Devoluciones en compras (debito)',               'type'=>'cost','nature'=>'credit'],
            ['code'=>'6180', 'name'=>'Descuentos comerciales en compras (debito)',     'type'=>'cost','nature'=>'credit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 7 — COSTOS DE PRODUCCION O DE OPERACION
            // ════════════════════════════════════════════════════════════════
            ['code'=>'7',    'name'=>'COSTOS DE PRODUCCION O DE OPERACION',            'type'=>'cost','nature'=>'debit'],
            ['code'=>'71',   'name'=>'Materiales',                                     'type'=>'cost','nature'=>'debit'],
            ['code'=>'7105', 'name'=>'Materias primas',                                'type'=>'cost','nature'=>'debit'],
            ['code'=>'7110', 'name'=>'Materiales indirectos',                          'type'=>'cost','nature'=>'debit'],
            ['code'=>'72',   'name'=>'Mano de obra directa',                           'type'=>'cost','nature'=>'debit'],
            ['code'=>'7205', 'name'=>'Sueldos y jornales',                             'type'=>'cost','nature'=>'debit'],
            ['code'=>'7210', 'name'=>'Horas extras y recargos',                        'type'=>'cost','nature'=>'debit'],
            ['code'=>'7215', 'name'=>'Auxilio de transporte',                          'type'=>'cost','nature'=>'debit'],
            ['code'=>'7220', 'name'=>'Cesantias',                                      'type'=>'cost','nature'=>'debit'],
            ['code'=>'7225', 'name'=>'Intereses sobre cesantias',                      'type'=>'cost','nature'=>'debit'],
            ['code'=>'7230', 'name'=>'Prima de servicios',                             'type'=>'cost','nature'=>'debit'],
            ['code'=>'7235', 'name'=>'Vacaciones',                                     'type'=>'cost','nature'=>'debit'],
            ['code'=>'73',   'name'=>'Costos indirectos',                              'type'=>'cost','nature'=>'debit'],
            ['code'=>'7305', 'name'=>'Materiales indirectos',                          'type'=>'cost','nature'=>'debit'],
            ['code'=>'7310', 'name'=>'Mano de obra indirecta',                         'type'=>'cost','nature'=>'debit'],
            ['code'=>'7315', 'name'=>'Depreciaciones',                                 'type'=>'cost','nature'=>'debit'],
            ['code'=>'7320', 'name'=>'Amortizaciones',                                 'type'=>'cost','nature'=>'debit'],
            ['code'=>'7325', 'name'=>'Agotamiento',                                    'type'=>'cost','nature'=>'debit'],
            ['code'=>'7330', 'name'=>'Servicios',                                      'type'=>'cost','nature'=>'debit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 8 — CUENTAS DE ORDEN DEUDORAS
            // ════════════════════════════════════════════════════════════════
            ['code'=>'8',    'name'=>'CUENTAS DE ORDEN DEUDORAS',                      'type'=>'asset','nature'=>'debit'],
            ['code'=>'81',   'name'=>'Derechos contingentes',                          'type'=>'asset','nature'=>'debit'],
            ['code'=>'8105', 'name'=>'Bienes y valores entregados en custodia',        'type'=>'asset','nature'=>'debit'],
            ['code'=>'8110', 'name'=>'Bienes y valores entregados en garantia',        'type'=>'asset','nature'=>'debit'],
            ['code'=>'82',   'name'=>'Deudoras de control',                            'type'=>'asset','nature'=>'debit'],
            ['code'=>'8205', 'name'=>'Bienes y valores recibidos en administracion',   'type'=>'asset','nature'=>'debit'],
            ['code'=>'8210', 'name'=>'Activos totalmente depreciados',                 'type'=>'asset','nature'=>'debit'],
            ['code'=>'8215', 'name'=>'Activos castigados',                             'type'=>'asset','nature'=>'debit'],
            ['code'=>'8220', 'name'=>'Inventarios en consignacion',                    'type'=>'asset','nature'=>'debit'],
            ['code'=>'83',   'name'=>'Deudoras fiscales',                              'type'=>'asset','nature'=>'debit'],
            ['code'=>'8305', 'name'=>'Diferencias en amortizacion de activos',         'type'=>'asset','nature'=>'debit'],
            ['code'=>'8310', 'name'=>'Perdidas fiscales por amortizar',                'type'=>'asset','nature'=>'debit'],

            // ════════════════════════════════════════════════════════════════
            // CLASE 9 — CUENTAS DE ORDEN ACREEDORAS
            // ════════════════════════════════════════════════════════════════
            ['code'=>'9',    'name'=>'CUENTAS DE ORDEN ACREEDORAS',                    'type'=>'liability','nature'=>'credit'],
            ['code'=>'91',   'name'=>'Responsabilidades contingentes',                 'type'=>'liability','nature'=>'credit'],
            ['code'=>'9105', 'name'=>'Garantias otorgadas',                            'type'=>'liability','nature'=>'credit'],
            ['code'=>'9110', 'name'=>'Litigios y demandas',                            'type'=>'liability','nature'=>'credit'],
            ['code'=>'92',   'name'=>'Acreedoras de control',                          'type'=>'liability','nature'=>'credit'],
            ['code'=>'9205', 'name'=>'Bienes y valores recibidos en custodia',         'type'=>'liability','nature'=>'credit'],
            ['code'=>'9210', 'name'=>'Bienes y valores recibidos en garantia',         'type'=>'liability','nature'=>'credit'],
        ];
    }
}
