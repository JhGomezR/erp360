<?php

namespace App\Central\Params\Controllers;

use App\Central\Params\Models\SystemParam;
use App\Central\Shared\Traits\HasCentralAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class SystemParamController extends Controller
{
    use HasCentralAudit;

    public function index(Request $request): JsonResponse
    {
        $query = SystemParam::orderBy('group')->orderBy('key');

        if ($request->filled('group')) {
            $query->where('group', $request->group);
        }

        $params = $query->get()->groupBy('group');

        return response()->json($params);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'params'        => ['required', 'array'],
            'params.*.key'  => ['required', 'string', 'exists:system_params,key'],
            'params.*.value'=> ['present'],
        ]);

        $updated = [];
        $before  = [];
        $after   = [];

        foreach ($data['params'] as $item) {
            $param = SystemParam::where('key', $item['key'])->first();

            if (! $param->is_editable) {
                return response()->json(['message' => "El parametro '{$item['key']}' no es editable."], 422);
            }

            $before[$item['key']] = $param->value;

            $value = is_array($item['value']) ? json_encode($item['value']) : (string) $item['value'];

            $param->update(['value' => $value]);
            $updated[] = $param->fresh();
            $after[$item['key']] = $value;
        }

        SystemParam::clearCache();

        $keys = implode(', ', array_column($data['params'], 'key'));

        $this->centralAudit(
            action:      'system_param.updated',
            level:       'warning',
            description: count($updated) . " parámetro(s) del sistema actualizados: {$keys}",
            module:      'system',
            before:      $before,
            after:       $after,
        );

        return response()->json([
            'message' => count($updated) . ' parametro(s) actualizados.',
            'params'  => $updated,
        ]);
    }

    public function show(string $key): JsonResponse
    {
        $param = SystemParam::where('key', $key)->firstOrFail();

        return response()->json(array_merge($param->toArray(), [
            'cast_value' => SystemParam::get($key),
        ]));
    }
}
