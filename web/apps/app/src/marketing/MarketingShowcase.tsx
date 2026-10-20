import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  CalendarDays,
  CheckSquare,
  ListMusic,
  Music2,
  MoreHorizontal,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useT } from '../i18n'

const STORIES = [
  {
    id: 'repertoire',
    features: [
      { icon: Music2, title: 'marketing.featureLibraryTitle', body: 'marketing.featureLibraryBody' },
      { icon: ListMusic, title: 'marketing.featureSetlistTitle', body: 'marketing.featureSetlistBody' },
    ],
  },
  {
    id: 'coordination',
    features: [
      { icon: CalendarDays, title: 'marketing.featureEventsTitle', body: 'marketing.featureEventsBody' },
      { icon: CheckSquare, title: 'marketing.featureTasksTitle', body: 'marketing.featureTasksBody' },
    ],
  },
  {
    id: 'team',
    features: [
      { icon: Users, title: 'marketing.featureRolesTitle', body: 'marketing.featureRolesBody' },
      { icon: ShieldCheck, title: 'marketing.featureSecurityTitle', body: 'marketing.featureSecurityBody' },
    ],
  },
] as const

function RepertoireScene() {
  const { t } = useT()
  return (
    <div className="marketing-scene__surface marketing-scene__repertoire">
      <div className="marketing-scene__topline"><span /><span /><span /></div>
      <div className="marketing-song">
        <div className="marketing-song__cover"><Music2 aria-hidden="true" /></div>
        <div className="marketing-song__lines"><i /><i /><i /></div>
      </div>
      <div className="marketing-arrangements">
        <span className="marketing-arrangements__label">{t('marketing.mockArrangementsTitle')}</span>
        <span className="marketing-arrangement is-selected"><i />{t('marketing.mockArrangement1')}<b>G</b></span>
        <span className="marketing-arrangement"><i />{t('marketing.mockArrangement2')}<b>D</b></span>
      </div>
      <div className="marketing-scene__wave" aria-hidden="true">
        {[12, 22, 15, 30, 18, 36, 22, 13, 28, 17, 33, 19, 11, 26, 16, 30, 12, 20].map((height, index) => (
          <i key={index} style={{ height }} />
        ))}
      </div>
    </div>
  )
}

function CoordinationScene() {
  const { t } = useT()
  const days = t('marketing.weekdays').split(' ')
  const events = [t('marketing.mockItem1'), t('marketing.mockItem2'), t('marketing.mockItem3')]
  return (
    <div className="marketing-scene__surface marketing-scene__calendar">
      <div className="marketing-scene__calendar-head">
        <CalendarDays aria-hidden="true" />
        <span>{t('marketing.mockWeek')}</span>
        <MoreHorizontal className="marketing-scene__calendar-menu" aria-hidden="true" />
      </div>
      <div className="marketing-scene__calendar-grid">
        {days.map((day, index) => (
          <span key={`${day}-${index}`} className={index === 2 ? 'is-active' : ''}>{day}</span>
        ))}
      </div>
      <div className="marketing-scene__calendar-events">
        {events.map((event, index) => (
          <div key={event} className={`marketing-scene__calendar-event is-${index + 1}`}>
            <span />
            <i />
            <b>{event}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamScene() {
  return (
    <div className="marketing-scene__surface marketing-scene__team">
      <div className="marketing-team__heading">
        <span className="marketing-team__avatar">S</span>
        <span className="marketing-team__heading-lines"><i /><i /></span>
        <span className="marketing-team__status" />
      </div>
      <div className="marketing-team__rows">
        {[0, 1, 2, 3].map((index) => (
          <div className="marketing-team__row" key={index}>
            <span className={`marketing-team__avatar is-${index}`}>{['M', 'A', 'J', 'L'][index]}</span>
            <span className="marketing-team__row-lines"><i /><i /></span>
            <span className={index === 0 ? 'marketing-team__role is-owner' : 'marketing-team__role'} />
          </div>
        ))}
      </div>
      <div className="marketing-team__footer"><span /><span /><span /></div>
    </div>
  )
}

function Scene({ id }: { id: string }) {
  return (
    <div className={`marketing-scene marketing-scene--${id}`} aria-hidden="true">
      <div className="marketing-scene__backplate" />
      {id === 'repertoire' ? <RepertoireScene /> : null}
      {id === 'coordination' ? <CoordinationScene /> : null}
      {id === 'team' ? <TeamScene /> : null}
    </div>
  )
}

export function MarketingShowcase() {
  const { t } = useT()
  const root = useRef<HTMLDivElement>(null)
  const [revealEnabled, setRevealEnabled] = useState(false)
  const [visibleStories, setVisibleStories] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const element = root.current
    if (!element || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver((entries) => {
      const revealed = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => (entry.target as HTMLElement).dataset.story)
        .filter((id): id is string => Boolean(id))
      if (revealed.length === 0) return
      setVisibleStories((current) => new Set([...current, ...revealed]))
      for (const entry of entries) {
        if (entry.isIntersecting) observer.unobserve(entry.target)
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

    element.querySelectorAll<HTMLElement>('[data-story]').forEach((story) => observer.observe(story))
    setRevealEnabled(true)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={root} className={`marketing-stories${revealEnabled ? ' has-reveal' : ''}`}>
      {STORIES.map((story, storyIndex) => (
        <article
          key={story.id}
          data-story={story.id}
          className={`marketing-story marketing-story--${story.id} ${storyIndex % 2 === 1 ? 'is-reversed' : ''}${visibleStories.has(story.id) ? ' is-visible' : ''}`}
          style={{ '--reveal-delay': `${storyIndex * 100}ms` } as CSSProperties}
        >
          <div className="marketing-story__copy">
            {story.features.map(({ icon: Icon, title, body }) => (
              <section className="marketing-story__feature" key={title}>
                <span className="marketing-story__icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{t(title)}</h3>
                  <p>{t(body)}</p>
                </div>
              </section>
            ))}
          </div>
          <Scene id={story.id} />
        </article>
      ))}
    </div>
  )
}
