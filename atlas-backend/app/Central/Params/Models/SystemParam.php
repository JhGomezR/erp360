<?php

namespace App\Central\Params\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class SystemParam extends Model
{
    protected $table = 'system_params';

    protected $fillable = ['group', 'key', 'value', 'type', 'label', 'description', 'is_editable'];

    protected $casts = ['is_editable' => 'boolean'];

    private const CACHE_KEY = 'system_params_all';
    private const CACHE_TTL = 3600; // 1 hora

    // ─── Acceso ───────────────────────────────────────────────────────────────

    /**
     * Obtiene un parámetro con cast automático según su tipo.
     * Uso: SystemParam::get('payroll.smlmv')
     *      SystemParam::get('media.max_upload_mb', 3)
     */
    public static function get(string $key, mixed $default = null): mixed
    {
        $all = static::allCached();
        $row = $all[$key] ?? null;

        if ($row === null) {
            return $default;
        }

        return static::cast($row['value'], $row['type']);
    }

    /**
     * Obtiene todos los parámetros de un grupo.
     * Uso: SystemParam::group('payroll')  →  ['smlmv' => 1423500, ...]
     */
    public static function group(string $group): array
    {
        $all    = static::allCached();
        $prefix = $group . '.';
        $result = [];

        foreach ($all as $key => $row) {
            if (str_starts_with($key, $prefix)) {
                $shortKey        = substr($key, strlen($prefix));
                $result[$shortKey] = static::cast($row['value'], $row['type']);
            }
        }

        return $result;
    }

    /**
     * Actualiza un parámetro e invalida el caché.
     */
    public static function set(string $key, mixed $value): void
    {
        static::where('key', $key)->update([
            'value'      => is_array($value) ? json_encode($value) : (string) $value,
            'updated_at' => now(),
        ]);
        static::clearCache();
    }

    public static function clearCache(): void
    {
        Cache::forget(static::CACHE_KEY);
    }

    // ─── Internos ─────────────────────────────────────────────────────────────

    private static function allCached(): array
    {
        return Cache::remember(static::CACHE_KEY, static::CACHE_TTL, function () {
            return static::all()->keyBy('key')->map(fn($p) => [
                'value' => $p->value,
                'type'  => $p->type,
            ])->toArray();
        });
    }

    private static function cast(mixed $value, string $type): mixed
    {
        return match($type) {
            'integer' => (int) $value,
            'decimal' => (float) $value,
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'json'    => json_decode($value, true),
            default   => $value,
        };
    }
}
