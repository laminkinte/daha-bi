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
            ? __(':who mentioned you on ":where"', ['who' => $who, 'where' => $where])
            : __(':who replied to your comment on ":where"', ['who' => $who, 'where' => $where]);
    }

    protected function link(): string
    {
        return rtrim(config('services.frontend_url'), '/')."/dashboards/{$this->comment->dashboard_id}?comment={$this->comment->id}";
    }

    public function toMail(object $notifiable): MailMessage
    {
        $author = $this->comment->user;

        return (new MailMessage)
            // From the person who commented (replies go to them); see App\Mail\SentOnBehalf.
            ->from(config('mail.from.address'), \App\Mail\SentOnBehalf::senderName($author))
            ->replyTo($author->email, $author->name)
            ->subject($this->headline())
            ->greeting(__('Hi :name,', ['name' => $notifiable->name]))
            ->line($this->headline().':')
            ->line('“'.Str::limit($this->comment->body, 280).'”')
            ->action(__('Open the conversation'), $this->link());
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
