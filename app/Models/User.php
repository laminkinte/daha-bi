<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements HasLocalePreference
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasApiTokens, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'referral_code',
        'referred_by_id',
        'low_bandwidth_mode',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            // is_admin and every plan_* field below are deliberately not in $fillable — none of
            // them may ever be settable via mass assignment (registration, profile update, etc.);
            // only AdminController/BillingController write them, via explicit ->update([...]).
            'is_admin' => 'boolean',
            'suspended_at' => 'datetime',
            'last_active_at' => 'datetime',
            'low_bandwidth_mode' => 'boolean',
            'trial_ends_at' => 'datetime',
            'subscribed_at' => 'datetime',
            'current_period_end' => 'datetime',
        ];
    }

    /**
     * @return HasMany<DataSource>
     */
    public function dataSources(): HasMany
    {
        return $this->hasMany(DataSource::class);
    }

    /**
     * @return HasMany<Dashboard>
     */
    public function dashboards(): HasMany
    {
        return $this->hasMany(Dashboard::class);
    }

    public function referredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_by_id');
    }

    /**
     * @return HasMany<User>
     */
    public function referrals(): HasMany
    {
        return $this->hasMany(User::class, 'referred_by_id');
    }

    /**
     * @return HasMany<Payment>
     */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * @return HasMany<AiConversation>
     */
    public function aiConversations(): HasMany
    {
        return $this->hasMany(AiConversation::class);
    }

    /** Emails and notifications to this person go out in the language they use the app in. */
    public function preferredLocale(): ?string
    {
        return $this->locale;
    }

    public function currentOrganization(): BelongsTo
    {
        return $this->belongsTo(Organization::class, 'current_organization_id');
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class, 'organization_members')->withPivot('role')->withTimestamps();
    }

    /**
     * This user's role within the given organization, or null if they aren't a member —
     * the one primitive every org-scoped authorization check is built on.
     */
    public function roleInOrganization(int $organizationId): ?string
    {
        return $this->organizations()->where('organizations.id', $organizationId)->first()?->pivot->role;
    }

    /**
     * Mirrors the existing owner/editor-can-write, viewer-cannot convention already used for
     * dashboard roles (see Dashboard::roleFor()) — owner, admin, and analyst can all create and
     * edit organization resources; only viewer is read-only.
     */
    public function canEditOrg(int $organizationId): bool
    {
        return in_array($this->roleInOrganization($organizationId), ['owner', 'admin', 'analyst'], true);
    }

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            if (empty($user->referral_code)) {
                do {
                    $code = strtoupper(Str::random(7));
                } while (static::where('referral_code', $code)->exists());

                $user->referral_code = $code;
            }
        });
    }
}
