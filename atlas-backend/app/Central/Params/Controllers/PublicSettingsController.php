<?php

namespace App\Central\Params\Controllers;

use App\Central\Params\Models\SystemParam;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * Endpoint público (sin auth) que expone configuraciones que el frontend
 * necesita antes de que el usuario inicie sesión: branding del login y
 * parámetros de prueba gratuita visibles al público.
 */
class PublicSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $branding = SystemParam::group('branding');
        $trial    = SystemParam::group('trial');
        $security = SystemParam::group('security');

        return response()->json([
            'branding' => [
                'login_bg_type'     => $branding['login_bg_type']     ?? 'gradient',
                'login_bg_value'    => $branding['login_bg_value']     ?? 'from-slate-900 to-slate-800',
                'login_bg_image'    => $branding['login_bg_image']     ?? null,
                'login_bg_color'    => $branding['login_bg_color']     ?? '#0f172a',
                'app_name'          => $branding['app_name']           ?? config('app.name', 'Atlas'),
                'logo_url'          => $branding['logo_url']           ?? null,
            ],
            'trial' => [
                'days'              => $trial['days']                  ?? 14,
                'card_required'     => $trial['card_required']         ?? false,
            ],
            'security' => [
                'idle_timeout'      => $security['idle_timeout']      ?? 30,
                'session_timeout'   => $security['session_timeout']   ?? 60,
            ],
        ]);
    }
}
