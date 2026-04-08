<?php

namespace App\Tenant\Accounting\Services;

/**
 * Genera XML UBL 2.1 para Factura Electrónica DIAN Colombia.
 *
 * Produce un documento XML válido según el esquema DIAN 2.1 (Anexo técnico 1.9).
 * El documento generado es un STUB: para producción se requiere:
 *   - Firma XAdES-BES con el certificado .p12 del emisor.
 *   - Envío al WS DIAN: https://vpfe.dian.gov.co/WcfDianCustomerServices.svc
 *   - Homologación del software con NIT de proveedor tecnológico.
 */
class DianUblBuilder
{
    private \DOMDocument $doc;

    private const NS_INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    private const NS_CAC     = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
    private const NS_CBC     = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
    private const NS_EXT     = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

    /**
     * @param  array  $config  Array con los campos de DianConfig (nit, razon_social, etc.)
     * @param  array  $sale    Array con los datos de la venta (code, total, items[], etc.)
     * @return string  XML UBL 2.1 serializado
     */
    public function build(array $config, array $sale): string
    {
        $this->doc = new \DOMDocument('1.0', 'UTF-8');
        $this->doc->formatOutput = true;

        $root = $this->doc->createElementNS(self::NS_INVOICE, 'Invoice');
        $root->setAttribute('xmlns:cac', self::NS_CAC);
        $root->setAttribute('xmlns:cbc', self::NS_CBC);
        $root->setAttribute('xmlns:ext', self::NS_EXT);
        $this->doc->appendChild($root);

        // ── Header ────────────────────────────────────────────────────────────
        $this->cbc($root, 'UBLVersionID', '2.1');
        $this->cbc($root, 'CustomizationID', '10');
        $this->cbc($root, 'ProfileID', 'DIAN 2.1');
        $this->cbc($root, 'ProfileExecutionID', ($config['ambiente'] ?? 'pruebas') === 'produccion' ? '1' : '2');
        $this->cbc($root, 'ID', $sale['code'] ?? $sale['sale_number'] ?? 'SIN-NUMERO');
        $this->cbc($root, 'UUID', $sale['cufe'] ?? '', ['schemeID' => 'CUFE-SHA384', 'schemeName' => 'CUFE-SHA384']);
        $this->cbc($root, 'IssueDate', substr((string)($sale['created_at'] ?? now()->toDateTimeString()), 0, 10));
        $this->cbc($root, 'IssueTime', substr((string)($sale['created_at'] ?? now()->toDateTimeString()), 11, 8) ?: '00:00:00');
        $this->cbc($root, 'InvoiceTypeCode', '01');  // 01 = Factura de venta
        $this->cbc($root, 'Note', htmlspecialchars($sale['notes'] ?? '', ENT_XML1));
        $this->cbc($root, 'DocumentCurrencyCode', $sale['currency_code'] ?? 'COP');
        $this->cbc($root, 'LineCountNumeric', (string) count($sale['items'] ?? []));

        // ── Periodo de facturación (requerido por DIAN) ───────────────────────
        $period = $this->cac($root, 'InvoicePeriod');
        $this->cbc($period, 'StartDate', substr((string)($sale['created_at'] ?? now()->toDateTimeString()), 0, 10));
        $this->cbc($period, 'EndDate',   substr((string)($sale['created_at'] ?? now()->toDateTimeString()), 0, 10));

        // ── Emisor (AccountingSupplierParty) ──────────────────────────────────
        $supplier = $this->cac($root, 'AccountingSupplierParty');
        $this->cbc($supplier, 'AdditionalAccountID', '1');  // 1=Persona jurídica
        $partyS = $this->cac($supplier, 'Party');

        $partyNameS = $this->cac($partyS, 'PartyName');
        $this->cbc($partyNameS, 'Name', htmlspecialchars($config['razon_social'] ?? 'EMISOR', ENT_XML1));

        $taxSchemeS = $this->cac($partyS, 'PartyTaxScheme');
        $this->cbc($taxSchemeS, 'RegistrationName', htmlspecialchars($config['razon_social'] ?? '', ENT_XML1));
        $this->cbc($taxSchemeS, 'CompanyID', $config['nit'] ?? '', [
            'schemeAgencyID'   => '195',
            'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
            'schemeID'         => $config['nit_dv'] ?? '0',
            'schemeName'       => '31',
        ]);
        $taxS = $this->cac($taxSchemeS, 'TaxScheme');
        $this->cbc($taxS, 'ID', '01');
        $this->cbc($taxS, 'Name', 'IVA');

        // ── Receptor (AccountingCustomerParty) ────────────────────────────────
        $customer = $this->cac($root, 'AccountingCustomerParty');
        $this->cbc($customer, 'AdditionalAccountID', '1');
        $partyC = $this->cac($customer, 'Party');

        $partyNameC = $this->cac($partyC, 'PartyName');
        $this->cbc($partyNameC, 'Name', htmlspecialchars($sale['customer_name'] ?? 'Consumidor Final', ENT_XML1));

        $taxSchemeC = $this->cac($partyC, 'PartyTaxScheme');
        $this->cbc($taxSchemeC, 'RegistrationName', htmlspecialchars($sale['customer_name'] ?? 'Consumidor Final', ENT_XML1));
        $this->cbc($taxSchemeC, 'CompanyID', $sale['customer_nit'] ?? '222222222', [
            'schemeID'   => '0',
            'schemeName' => '13',
        ]);
        $taxC = $this->cac($taxSchemeC, 'TaxScheme');
        $this->cbc($taxC, 'ID', '01');
        $this->cbc($taxC, 'Name', 'IVA');

        // ── Medios de pago ────────────────────────────────────────────────────
        $payMeans = $this->cac($root, 'PaymentMeans');
        $this->cbc($payMeans, 'ID', '1');
        $this->cbc($payMeans, 'PaymentMeansCode', match ($sale['payment_method'] ?? 'cash') {
            'cash'     => '10',
            'card'     => '48',
            'transfer' => '42',
            default    => '1',
        });
        $this->cbc($payMeans, 'PaymentDueDate', substr((string)($sale['created_at'] ?? now()->toDateTimeString()), 0, 10));

        // ── IVA total ─────────────────────────────────────────────────────────
        $curr = $sale['currency_code'] ?? 'COP';
        $tax  = (float)($sale['tax'] ?? 0);
        if ($tax > 0) {
            $taxTotal = $this->cac($root, 'TaxTotal');
            $this->cbc($taxTotal, 'TaxAmount', number_format($tax, 2, '.', ''), ['currencyID' => $curr]);
            $taxSub = $this->cac($taxTotal, 'TaxSubtotal');
            $this->cbc($taxSub, 'TaxableAmount', number_format((float)($sale['subtotal'] ?? 0), 2, '.', ''), ['currencyID' => $curr]);
            $this->cbc($taxSub, 'TaxAmount', number_format($tax, 2, '.', ''), ['currencyID' => $curr]);
            $taxCat = $this->cac($taxSub, 'TaxCategory');
            $this->cbc($taxCat, 'Percent', '19.00');
            $schemeTax = $this->cac($taxCat, 'TaxScheme');
            $this->cbc($schemeTax, 'ID', '01');
            $this->cbc($schemeTax, 'Name', 'IVA');
        }

        // ── Totales monetarios ────────────────────────────────────────────────
        $monetary = $this->cac($root, 'LegalMonetaryTotal');
        $this->cbc($monetary, 'LineExtensionAmount', number_format((float)($sale['subtotal'] ?? 0), 2, '.', ''), ['currencyID' => $curr]);
        $this->cbc($monetary, 'TaxExclusiveAmount',  number_format((float)($sale['subtotal'] ?? 0), 2, '.', ''), ['currencyID' => $curr]);
        $this->cbc($monetary, 'TaxInclusiveAmount',  number_format((float)($sale['total'] ?? 0), 2, '.', ''),    ['currencyID' => $curr]);
        $this->cbc($monetary, 'ChargeTotalAmount',   '0.00', ['currencyID' => $curr]);
        $this->cbc($monetary, 'PayableAmount',       number_format((float)($sale['total'] ?? 0), 2, '.', ''),    ['currencyID' => $curr]);

        // ── Líneas de factura ─────────────────────────────────────────────────
        foreach (($sale['items'] ?? []) as $idx => $item) {
            $line = $this->cac($root, 'InvoiceLine');
            $this->cbc($line, 'ID', (string)($idx + 1));
            $this->cbc($line, 'InvoicedQuantity', number_format((float)($item['quantity'] ?? 1), 4, '.', ''), ['unitCode' => 'EA']);
            $this->cbc($line, 'LineExtensionAmount', number_format((float)($item['subtotal'] ?? 0), 2, '.', ''), ['currencyID' => $curr]);

            $itemEl = $this->cac($line, 'Item');
            $this->cbc($itemEl, 'Description', htmlspecialchars($item['product_name'] ?? $item['description'] ?? '', ENT_XML1));
            $standardItem = $this->cac($itemEl, 'StandardItemIdentification');
            $this->cbc($standardItem, 'ID', (string)($item['product_id'] ?? '0'), ['schemeID' => '001']);

            $price = $this->cac($line, 'Price');
            $this->cbc($price, 'PriceAmount', number_format((float)($item['unit_price'] ?? 0), 2, '.', ''), ['currencyID' => $curr]);
            $this->cbc($price, 'BaseQuantity', '1.0000', ['unitCode' => 'EA']);
        }

        return $this->doc->saveXML();
    }

    // ── Helpers DOM ────────────────────────────────────────────────────────────

    private function cbc(\DOMElement $parent, string $localName, string $value, array $attrs = []): \DOMElement
    {
        $el = $this->doc->createElementNS(self::NS_CBC, 'cbc:' . $localName);
        $el->nodeValue = $value;
        foreach ($attrs as $k => $v) {
            $el->setAttribute($k, $v);
        }
        $parent->appendChild($el);
        return $el;
    }

    private function cac(\DOMElement $parent, string $localName): \DOMElement
    {
        $el = $this->doc->createElementNS(self::NS_CAC, 'cac:' . $localName);
        $parent->appendChild($el);
        return $el;
    }
}
