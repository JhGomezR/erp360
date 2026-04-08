<?php

namespace App\Tenant\Commissions\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommissionRule extends Model
{
    protected $table = 'commission_rules';

    protected $fillable = [
        'name', 'applies_to', 'entity_id', 'entity_name',
        'type', 'value', 'is_active', 'notes',
    ];

    protected $casts = [
        'value'     => 'decimal:4',
        'is_active' => 'boolean',
    ];

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class, 'rule_id');
    }

    /**
     * Calcula el monto de comisión para un importe y cantidad dados.
     */
    public function calculate(float $lineAmount): float
    {
        if ($this->type === 'percentage') {
            return round($lineAmount * ((float) $this->value / 100), 2);
        }

        // fixed: valor fijo por venta (no por unidad)
        return round((float) $this->value, 2);
    }

    /**
     * Determina si esta regla aplica al producto/categoría del ítem de venta.
     */
    public function appliesToItem(int $productId, ?int $categoryId): bool
    {
        return match ($this->applies_to) {
            'all'      => true,
            'product'  => $this->entity_id === $productId,
            'category' => $this->entity_id !== null && $this->entity_id === $categoryId,
            default    => false,
        };
    }
}
