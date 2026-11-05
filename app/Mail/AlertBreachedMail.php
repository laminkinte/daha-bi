<?php

namespace App\Mail;

use App\Models\Alert;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class AlertBreachedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Alert $alert,
        public float $value,
        public ?float $baselineMean = null,
        public ?float $baselineStddev = null,
    ) {
    }

    public function build(): self
    {
        $chart = $this->alert->chart;

        $subject = $this->alert->condition === 'anomaly'
            ? "Alert: {$chart->title} looks unusual"
            : "Alert: {$chart->title} is {$this->alert->condition} {$this->alert->threshold}";

        return $this->subject($subject)
            ->view('mail.alert-breached', [
                'alert' => $this->alert,
                'chart' => $chart,
                'dashboard' => $chart->dashboard,
                'value' => $this->value,
                'baselineMean' => $this->baselineMean,
                'baselineStddev' => $this->baselineStddev,
            ]);
    }
}
