<?php

namespace App\Tenant\Accounting\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Tenant\Purchases\Models\Supplier;
use App\Tenant\Purchases\Models\PurchaseOrder;

/**
 * Documento Soporte Electrónico (DSE) — DIAN Colombia.
 *
 * Requerido cuando se adquieren bienes/servicios de proveedores no obligados a FE.
 * Equivalente a la FE pero emitido por el COMPRADOR.
 */
class ElectronicSupportDoc extends Model
{
    protected $table = 'electronic_support_docs';

    protected $fillable = [
        'doc_number',
        'supplier_id',
        'purchase_order_id',
        'doc_date',
        'status',
        'subtotal',
        'tax',
        'total',
        'notes',
        'cuds',
        'qr_data',
        'issued_at',
        'user_id',
    ];

    protected $casts = [
        'doc_date'  => 'date:Y-m-d',
        'issued_at' => 'datetime',
        'subtotal'  => 'decimal:2',
        'tax'       => 'decimal:2',
        'total'     => 'decimal:2',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ElectronicSupportDocItem::class, 'doc_id');
    }

    /** Genera el número correlativo: DS-000001 */
    public static function nextNumber(): string
    {
        $last = static::orderByDesc('id')->value('doc_number');
        $num  = $last ? (int) substr($last, -6) + 1 : 1;
        return 'DS-' . str_pad($num, 6, '0', STR_PAD_LEFT);
    }
}
