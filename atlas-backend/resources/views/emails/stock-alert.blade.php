<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
        .wrapper { max-width: 640px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
        .header-store     { background: #dc2626; padding: 24px 32px; }
        .header-warehouse { background: #d97706; padding: 24px 32px; }
        .header-store h2, .header-warehouse h2 { color: #fff; margin: 0; font-size: 18px; }
        .header-store p, .header-warehouse p { color: rgba(255,255,255,.85); margin: 4px 0 0; font-size: 13px; }
        .section { padding: 24px 32px; }
        .section-label { font-size: 13px; font-weight: bold; margin-bottom: 12px; }
        .label-store     { color: #dc2626; }
        .label-warehouse { color: #d97706; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; color: #374151; text-align: left; padding: 9px 11px; font-size: 12px; border-bottom: 2px solid #e5e7eb; }
        td { padding: 9px 11px; font-size: 13px; border-bottom: 1px solid #e5e7eb; color: #374151; }
        .deficit { color: #dc2626; font-weight: bold; }
        .hint { font-size: 12px; color: #6b7280; margin-top: 10px; }
        .divider { border: none; border-top: 1px solid #e5e7eb; margin: 0; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; }
        .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
    </style>
</head>
<body>
<div class="wrapper">

    @php
        $hasStore     = count($storeProducts) > 0;
        $hasWarehouse = count($warehouseProducts) > 0;
    @endphp

    {{-- ─── SECCION TIENDA ─────────────────────────────────────────────── --}}
    @if($hasStore)
    <div class="header-store">
        <h2>Alerta de Stock — Tienda(s)</h2>
        <p>{{ $tenantName }} &middot; {{ count($storeProducts) }} producto(s) con stock bajo en punto(s) de venta &middot; {{ now()->format('d/m/Y H:i') }}</p>
    </div>
    <div class="section">
        <p class="section-label label-store">Productos agotandose en tienda</p>
        <table>
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Tienda</th>
                    <th>Stock actual</th>
                    <th>Minimo</th>
                    <th>Deficit</th>
                </tr>
            </thead>
            <tbody>
                @foreach($storeProducts as $p)
                <tr>
                    <td>{{ $p['name'] }}</td>
                    <td>{{ $p['sku'] ?? '-' }}</td>
                    <td>{{ $p['location'] }}</td>
                    <td>{{ number_format($p['stock'], 2) }}</td>
                    <td>{{ number_format($p['min_stock'], 2) }}</td>
                    <td class="deficit">-{{ number_format($p['deficit'], 2) }}</td>
                </tr>
                @endforeach
            </tbody>
        </table>
        <p class="hint">Realiza un traslado desde bodega para reponer el stock en tienda.</p>
    </div>
    @endif

    @if($hasStore && $hasWarehouse)
    <hr class="divider">
    @endif

    {{-- ─── SECCION BODEGA ─────────────────────────────────────────────── --}}
    @if($hasWarehouse)
    <div class="header-warehouse">
        <h2>Alerta de Stock — Bodega(s)</h2>
        <p>{{ $tenantName }} &middot; {{ count($warehouseProducts) }} producto(s) con stock bajo en bodega(s) &middot; {{ now()->format('d/m/Y H:i') }}</p>
    </div>
    <div class="section">
        <p class="section-label label-warehouse">Productos agotandose en bodega</p>
        <table>
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Bodega</th>
                    <th>Stock actual</th>
                    <th>Minimo</th>
                    <th>Deficit</th>
                </tr>
            </thead>
            <tbody>
                @foreach($warehouseProducts as $p)
                <tr>
                    <td>{{ $p['name'] }}</td>
                    <td>{{ $p['sku'] ?? '-' }}</td>
                    <td>{{ $p['location'] }}</td>
                    <td>{{ number_format($p['stock'], 2) }}</td>
                    <td>{{ number_format($p['min_stock'], 2) }}</td>
                    <td class="deficit">-{{ number_format($p['deficit'], 2) }}</td>
                </tr>
                @endforeach
            </tbody>
        </table>
        <p class="hint">Genera una orden de compra al proveedor para reponer el inventario en bodega.</p>
    </div>
    @endif

    <div class="footer">
        <p>Mensaje automatico de Atlas ERP &middot; No respondas a este correo</p>
    </div>
</div>
</body>
</html>
