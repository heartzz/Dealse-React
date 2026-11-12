import Link from "next/link";
import type { DealSeNotificationPage } from "../lib/dealse-api";
import { markAllNotificationsRead, markNotificationRead } from "../app/notifications/actions";

export function NotificationInbox({
  surface,
  result,
  error,
}: {
  surface: "customer" | "retailer";
  result: DealSeNotificationPage | null;
  error: boolean;
}) {
  const items = result?.items ?? [];
  return (
    <main className={`notification-shell notification-shell--${surface}`}>
      <header className="notification-header">
        <Link className="brand-mark" href={surface === "customer" ? "/" : "/retailer/dashboard"}>DealSe</Link>
        <Link className="notification-back-link" href={`/${surface}/dashboard`}>Back to {surface === "customer" ? "profile" : "workspace"}</Link>
      </header>
      <section className="notification-panel" aria-labelledby="notification-title">
        <div className="notification-panel-heading">
          <div>
            <p className="eyebrow">{surface === "customer" ? "YOUR DEALS" : "STORE WORKSPACE"}</p>
            <h1 id="notification-title">Notifications</h1>
            <p>Updates about your DealSe activity.</p>
            {result ? <p className="notification-unread-count" role="status">{result.unreadCount} unread</p> : null}
          </div>
          {result?.unreadCount ? <form action={markAllNotificationsRead.bind(null, surface)}>
            <button className="notification-mark-all" type="submit">Mark all as read</button>
          </form> : null}
        </div>

        {error && <div className="notification-message notification-message--error" role="alert"><p>Notifications could not be loaded or updated.</p><Link href={`/${surface}/notifications`}>Try again</Link></div>}
        {!error && items.length === 0 && <div className="notification-empty"><span aria-hidden="true">✓</span><h2>You’re all caught up</h2><p>New offer and store updates will appear here.</p></div>}
        {items.length > 0 && <ul className="notification-list">
          {items.map((item) => {
            const safeHref = item.href?.startsWith("/") && !item.href.startsWith("//") ? item.href : null;
            return <li className={`notification-item${item.isRead ? " is-read" : " is-unread"}`} key={item.id}>
              <span className="notification-indicator" aria-hidden="true" />
              <div className="notification-copy">
                <div className="notification-title-row"><h2>{item.title}</h2><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
                <p>{item.body}</p>
                {safeHref && <Link className="notification-open-link" href={safeHref}>Open update</Link>}
              </div>
              {!item.isRead && <form action={markNotificationRead.bind(null, surface, item.id)}>
                <button className="notification-mark-read" type="submit" aria-label={`Mark “${item.title}” as read`}>Mark read</button>
              </form>}
            </li>;
          })}
        </ul>}
      </section>
    </main>
  );
}
