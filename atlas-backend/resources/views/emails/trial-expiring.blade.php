<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
        .wrapper { max-width: 620px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
        .header { background: #2563eb; padding: 24px 32px; }
        .header h1 { color: #fff; margin: 0; font-size: 20px; }
        .header p  { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
        .body { padding: 32px; }
        .body p { color: #374151; line-height: 1.6; margin: 0 0 16px; }
        .countdown { text-align: center; margin: 24px 0; }
        .countdown .days { font-size: 56px; font-weight: bold; color: #dc2626; }
        .countdown .label { color: #6b7280; font-size: 14px; }
        .cta { display: block; margin: 24px auto; width: fit-content; background: #2563eb; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 15px; }
        .features { background: #f0f9ff; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
        .features ul { margin: 8px 0 0; padding-left: 18px; color: #0c4a6e; font-size: 13px; line-height: 1.8; }
        .footer { background: #f9fafb; padding: 16px 32px; text-align: center; }
        .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
    </style>
</head>
<body>
<div class="wrapper">
    <div class="header">
        <h1>Tu prueba está por vencer</h1>
        <p>{{ $tenantName }}</p>
    </div>
    <div class="body">
        <p>Hola <strong>{{ $ownerName }}</strong>,</p>
        <p>Tu período de prueba gratuita de <strong>Atlas ERP</strong> para <strong>{{ $tenantName }}</strong> vence pronto.</p>

        <div class="countdown">
            <div class="days">{{ $daysLeft }}</div>
            <div class="label">{{ $daysLeft === 1 ? 'día restante' : 'días restantes' }}</div>
        </div>

        <div class="features">
            <strong style="color:#0c4a6e;">¿Por qué actualizar?</strong>
            <ul>
                <li>Todos tus datos conservados sin interrupciones</li>
                <li>Soporte prioritario 24/7</li>
                <li>Acceso completo a todos los módulos</li>
                <li>Sin límite de usuarios ni transacciones</li>
            </ul>
        </div>

        <a href="{{ $upgradeUrl }}" class="cta">Actualizar mi plan ahora</a>

        <p style="text-align:center;color:#6b7280;font-size:13px;">Si ya actualizaste tu plan, ignora este mensaje.</p>
    </div>
    <div class="footer">
        <p>Atlas ERP — Este es un mensaje automático. No respondas a este correo.</p>
    </div>
</div>
</body>
</html>
