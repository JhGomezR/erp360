<?php

namespace App\Tenant\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class Promotion extends Model
{
    protected $table = 'promotions';

    protected $fillable = [
        'name',
        'type',
        'discount_value',
        'applies_to',
        'entity_id',
        'min_quantity',
        'min_amount',
        'bogo_buy',
        'bogo_get',
        'starts_at',
        'ends_at',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'discount_value' => 'decimal:2',
        'min_amount'     => 'decimal:2',
        'min_quantity'   => 'integer',
        'bogo_buy'       => 'integer',
        'bogo_get'       => 'integer',
        'is_active'      => 'boolean',
        'starts_at'      => 'datetime',
        'ends_at'        => 'datetime',
    ];

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Verifica si esta promoción aplica a un producto/categoría dado.
     */
    public function appliesToProduct(int $productId, ?int $categoryId): bool
    {
        return match ($this->applies_to) {
            'all'      => true,
            'product'  => $this->entity_id === $productId,
            'category' => $this->entity_id !== null && $this->entity_id === $categoryId,
            default    => false,
        };
    }

    /**
     * Calcula el descuento en pesos sobre un precio base y cantidad dada.
     * Devuelve 0 si la promoción no aplica por cantidad/monto.
     */
    public function calculateDiscount(float $unitPrice, int $quantity): float
    {
        if ($quantity < $this->min_quantity) return 0;
        if ($this->min_amount !== null && ($unitPrice * $quantity) < (float) $this->min_amount) return 0;

        return match ($this->type) {
            'percentage' => round($unitPrice * ((float) $this->discount_value / 100), 2),
            'fixed'      => min((float) $this->discount_value, $unitPrice),
            'bogo'       => $this->calculateBogoDiscount($unitPrice, $quantity),
            default      => 0,
        };
    }

    private function calculateBogoDiscount(float $unitPrice, int $quantity): float
    {
        $buy = max(1, (int) $this->bogo_buy);
        $get = max(1, (int) $this->bogo_get);
        $sets = intdiv($quantity, $buy + $get);
        return $sets > 0 ? round($unitPrice * $sets * $get, 2) : 0;
    }
}
