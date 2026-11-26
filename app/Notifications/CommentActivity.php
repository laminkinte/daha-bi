<?php

namespace App\Notifications;

use App\Models\Comment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

/** "X mentioned you" / "X replied to your comment" — in-app bell plus an email. */
class CommentActivity extends Notification
{
    use Queueable;

    /** @param 'mention'|'reply' $kind */
    public function __construct(public Comment $comment, public string $kind)
    {
    }

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    protected function headline(): string
    {
        $who = $this->comment->user->name;
        $where = $this->comment->dashboard->name;

        return $this->kind === 'mention'
            ? "{$who} mentioned you on \"{$where}\""
            : "{$who} replied to your comment on \"{$where}\"";
    }

    protected function link(): string
    {
        return rtrim(config('services.frontend_url'), '/')."/dashboards/{$this->comment->dashboard_id}?comment={$this->comment->id}";
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->headline())
            ->greeting('Hi '.$notifiable->name.',')
            ->line($this->headline().':')
            ->line('“'.Str::limit($this->comment->body, 280).'”')
            ->action('Open the conversation', $this->link());
    }

    public function toArray(object $notifiable): array
    {
        return [
            'kind' => $this->kind,
            'title' => $this->headline(),
            'excerpt' => Str::limit($this->comment->body, 140),
            'dashboard_id' => $this->comment->dashboard_id,
            'chart_id' => $this->comment->chart_id,
            'comment_id' => $this->comment->id,
            'actor' => $this->comment->user->name,
        ];
    }
}
