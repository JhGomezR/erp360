<?php

namespace App\Tenant\CollectionAccounts\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CollectionAccountEntity extends Model
{
    protected $table = 'collection_account_entities';

    protected $fillable = [
        'name', 'type', 'nit',
        'contact_name', 'contact_email', 'contact_phone',
        'address', 'is_active', 'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function accounts(): HasMany
    {
        return $this->hasMany(CollectionAccount::class, 'entity_id');
    }
}
