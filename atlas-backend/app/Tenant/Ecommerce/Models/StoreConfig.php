<?php

namespace App\Tenant\Ecommerce\Models;

use Illuminate\Database\Eloquent\Model;

class StoreConfig extends Model
{
    protected $table = 'store_config';

    protected $fillable = [
        'store_name',
        'store_description',
        'store_logo',
        'store_banner',
        'store_slug',
        'is_active',
        'pse_enabled',
        'mercadopago_enabled',
        'stripe_enabled',
        'cash_on_delivery',
        'mercadopago_public_key',
        'mercadopago_access_token',
        'stripe_publishable_key',
        'stripe_secret_key',
        'pse_merchant_id',
        'pse_api_key',
        'shipping_enabled',
        'shipping_cost',
        'free_shipping_from',
        'currency',
        'tax_rate',
    ];

    protected $hidden = [
        'mercadopago_access_token',
        'stripe_secret_key',
        'pse_api_key',
    ];

    protected $casts = [
        'is_active'                 => 'boolean',
        'pse_enabled'               => 'boolean',
        'mercadopago_enabled'       => 'boolean',
        'stripe_enabled'            => 'boolean',
        'cash_on_delivery'          => 'boolean',
        'shipping_enabled'          => 'boolean',
        'shipping_cost'             => 'decimal:2',
        'free_shipping_from'        => 'decimal:2',
        'tax_rate'                  => 'decimal:2',
        // Encrypted secrets (API keys and tokens)
        'mercadopago_access_token'  => 'encrypted',
        'stripe_secret_key'         => 'encrypted',
        'pse_api_key'               => 'encrypted',
    ];
}
