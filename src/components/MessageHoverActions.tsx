/* eslint-disable react-refresh/only-export-components -- Compound component exposes static subcomponents. */
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react'
import './MessageHoverActions.css'

function MessageHoverActionsRoot({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`message-hover-actions ${className}`.trim()} {...props} />
}

function MessageHoverActionsTools({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`message-hover-actions-tools ${className}`.trim()} {...props} />
}

function MessageHoverActionsAction({ className = '', type = 'button', ...props }: ComponentPropsWithoutRef<'button'>) {
  return <button className={`message-hover-actions-action ${className}`.trim()} type={type} {...props} />
}

export const MessageHoverActions = Object.assign(MessageHoverActionsRoot, {
  Tools: MessageHoverActionsTools,
  Action: MessageHoverActionsAction,
})
