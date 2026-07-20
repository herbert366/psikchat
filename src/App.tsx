import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'
import { clusterGroups, APP_CONFIG } from './config'
import { db } from './mockDatabase'
import type { Memory } from './mockDatabase'

type View = 'chat' | 'memories'
type MemorySort = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'usage-desc' | 'usage-asc' | 'feedback-desc' | 'feedback-asc'

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function App() {
  const [view, setView] = useState<View>('chat')
  const [isChatsOpen, setIsChatsOpen] = useState(true)
  const [activeChat, setActiveChat] = useState<string | null>(APP_CONFIG.seedChats[0].id)
  const [messages, setMessages] = useState(() => db.messages(APP_CONFIG.seedChats[0].id))
  const [message, setMessage] = useState('')
  const [memory, setMemory] = useState('')
  const [memories, setMemories] = useState<Memory[]>(() => db.memories())
  const [isMemoryOpen, setIsMemoryOpen] = useState(false)
  const [editingMemoryId, setEditingMemoryId] = useState<number | null>(null)
  const [memoryMessageId, setMemoryMessageId] = useState<string | null>(null)
  const [tablePage, setTablePage] = useState(0)
  const [memorySearch, setMemorySearch] = useState('')
  const [memorySort, setMemorySort] = useState<MemorySort>('updated-desc')
  const [clusterPage, setClusterPage] = useState(0)
  const [openChatMenuId, setOpenChatMenuId] = useState<string | null>(null)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [chatTitle, setChatTitle] = useState('')
  const chatTitleInputRef = useRef<HTMLInputElement>(null)

  const searchableText = normalizeSearchText(memorySearch.trim())
  const filteredMemories = memories.filter((memoryItem) => normalizeSearchText(memoryItem.text).includes(searchableText))
  const sortedMemories = [...filteredMemories].sort((first, second) => {
    const [field, direction] = memorySort.split('-') as ['updated' | 'created' | 'usage' | 'feedback', 'asc' | 'desc']
    const firstValue = field === 'updated' ? first.updated_at : field === 'created' ? first.created_at : field === 'usage' ? first.usage_count : first.feedback_score
    const secondValue = field === 'updated' ? second.updated_at : field === 'created' ? second.created_at : field === 'usage' ? second.usage_count : second.feedback_score
    const comparison = typeof firstValue === 'string' ? firstValue.localeCompare(secondValue as string) : firstValue - (secondValue as number)
    return direction === 'asc' ? comparison : -comparison
  })
  const totalTablePages = Math.max(1, Math.ceil(sortedMemories.length / APP_CONFIG.tablePageSize))
  const currentMemoryIds = new Set(memories.map((memoryItem) => memoryItem.id))
  const visibleClusters = clusterGroups
    .map((cluster) => ({ ...cluster, items: cluster.items.filter((item) => currentMemoryIds.has(item.id)) }))
    .filter((cluster) => cluster.items.length > 0)
  const totalClusterPages = Math.max(1, Math.ceil(visibleClusters.length / APP_CONFIG.clusterPageSize))

  const currentTablePage = Math.min(tablePage, totalTablePages - 1)
  const paginatedMemories = sortedMemories.slice(currentTablePage * APP_CONFIG.tablePageSize, (currentTablePage + 1) * APP_CONFIG.tablePageSize)
  const currentClusterPage = Math.min(clusterPage, totalClusterPages - 1)
  const paginatedClusters = visibleClusters.slice(currentClusterPage * APP_CONFIG.clusterPageSize, (currentClusterPage + 1) * APP_CONFIG.clusterPageSize)
  const chats = [...db.chats()].sort((first, second) => Number(second.pinned) - Number(first.pinned))

  useEffect(() => {
    if (editingChatId) {
      chatTitleInputRef.current?.focus()
      chatTitleInputRef.current?.select()
    }
  }, [editingChatId])

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text) return

    if (!activeChat) return
    const nextMessage = { id: `message-${Date.now()}`, author: 'user' as const, text }
    db.addMessage(activeChat, nextMessage)
    setMessages((current) => [...current, nextMessage])
    setMessage('')
  }

  function createMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = memory.trim()
    if (!text) return

    db.createMemory(text)
    setMemories(db.memories())
    setMemory('')
    setIsMemoryOpen(false)
  }

  function editMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = memory.trim()
    if (!text || editingMemoryId === null) return
    db.updateMemory(editingMemoryId, text)
    setMemories(db.memories())
    setMemory('')
    setEditingMemoryId(null)
    setIsMemoryOpen(false)
  }

  function openMemoryEditor(memoryItem: Memory) {
    setEditingMemoryId(memoryItem.id)
    setMemory(memoryItem.text)
    setIsMemoryOpen(true)
  }

  function deleteMemory(id: number) {
    db.deleteMemory(id)
    setMemories(db.memories())
    setClusterPage((page) => Math.min(page, Math.max(0, Math.ceil(visibleClusters.length / APP_CONFIG.clusterPageSize) - 1)))
  }

  function navigate(target: View) {
    setIsMemoryOpen(false)
    setView(target)
  }

  function selectChat(title: string) {
    const chat = db.chats().find((item) => item.title === title)
    if (!chat) return
    setActiveChat(chat.id)
    setMessages(db.messages(chat.id))
    navigate('chat')
  }

  function openRenameChat(chatId: string) {
    const chat = db.chats().find((item) => item.id === chatId)
    if (!chat) return
    setEditingChatId(chatId)
    setChatTitle(chat.title)
    setOpenChatMenuId(null)
  }

  function saveChatRename() {
    const title = chatTitle.trim()
    if (!title || !editingChatId) return
    db.renameChat(editingChatId, title)
    setEditingChatId(null)
    setChatTitle('')
  }

  function handleChatRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveChatRename()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditingChatId(null)
      setChatTitle('')
    }
  }

  function toggleChatPinned(chatId: string) {
    db.toggleChatPinned(chatId)
    setOpenChatMenuId(null)
  }

  function deleteChat(chatId: string) {
    db.deleteChat(chatId)
    if (activeChat === chatId) {
      const nextChat = db.chats()[0]
      setActiveChat(nextChat?.id ?? null)
      setMessages(nextChat ? db.messages(nextChat.id) : [])
    }
    setOpenChatMenuId(null)
  }

  function startNewChat() {
    const chat = db.createChat()
    setMessages(chat.messages)
    setMessage('')
    setMemoryMessageId(null)
    setActiveChat(chat.id)
    navigate('chat')
  }

  return (
    <main className="chat-shell">
      <aside className="sidebar" aria-label="Conversas">
        <nav className="side-nav" aria-label="Navegacao principal">
          <div className="sidebar-header">
          <button
            className="chats-toggle"
            type="button"
            aria-expanded={isChatsOpen}
            onClick={() => setIsChatsOpen((current) => !current)}
          >
            <span>Chats</span>
             <span className="chevron" aria-hidden="true" />
          </button>
          <button className="new-chat" type="button" aria-label="Novo chat" onClick={startNewChat}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M8 9.00006H6.2C5.0799 9.00006 4.51984 9.00006 4.09202 9.21805C3.71569 9.40979 3.40973 9.71575 3.21799 10.0921C3 10.5199 3 11.08 3 12.2001V17.8001C3 18.9202 3 19.4802 3.21799 19.908C3.40973 20.2844 3.71569 20.5903 4.09202 20.7821C4.51984 21.0001 5.07989 21.0001 6.2 21.0001H17.787C18.9071 21.0001 19.4671 21.0001 19.895 20.7821C20.2713 20.5903 20.5772 20.2844 20.769 19.908C20.987 19.4802 20.987 18.9202 20.987 17.8001V12.0001M6 15.0001H6.01M10 15H10.01M11.5189 12.8946L12.8337 12.6347C13.5432 12.4945 13.8979 12.4244 14.2287 12.2953C14.5223 12.1807 14.8013 12.0318 15.06 11.8516C15.3514 11.6487 15.607 11.393 16.1184 10.8816L21.2668 5.73321C21.9541 5.04596 21.9541 3.9317 21.2668 3.24444C20.5796 2.55719 19.4653 2.55719 18.7781 3.24445L13.5416 8.48088C13.0625 8.96004 12.8229 9.19963 12.6294 9.47121C12.4576 9.71232 12.3131 9.97174 12.1986 10.2447C12.0696 10.5522 12.0696 10.8821 11.837 11.5417L11.5189 12.8946Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          </div>
          {isChatsOpen && (
            <div className="chat-list">
                {chats.map((chat) => (
                  <div
                     className={`chat-list-item ${view === 'chat' && activeChat === chat.id ? 'active' : ''}`}
                     key={chat.id}
                  >
                   {editingChatId === chat.id ? (
                     <input
                       ref={chatTitleInputRef}
                       className="chat-rename-input"
                       id={`chat-title-${chat.id}`}
                       aria-label="Renomear chat"
                       value={chatTitle}
                       onChange={(event) => setChatTitle(event.target.value)}
                       onKeyDown={handleChatRenameKeyDown}
                       onBlur={saveChatRename}
                       onClick={(event) => event.stopPropagation()}
                     />
                   ) : (
                     <>
                       <button className="chat-title" type="button" onClick={() => selectChat(chat.title)}>
                         {chat.pinned && <span className="chat-pin" aria-label="Chat fixado">&#128204;</span>}
                         <span>{chat.title}</span>
                       </button>
                       <button
                         className="chat-menu-trigger"
                         type="button"
                         aria-label={`Opcoes de ${chat.title}`}
                         aria-expanded={openChatMenuId === chat.id}
                         onClick={() => setOpenChatMenuId((current) => current === chat.id ? null : chat.id)}
                       >
                         <span aria-hidden="true">&#8943;</span>
                       </button>
                       {openChatMenuId === chat.id && (
                         <div className="chat-context-menu" role="menu">
                           <button type="button" role="menuitem" onClick={() => openRenameChat(chat.id)}>Renomear</button>
                           <button type="button" role="menuitem" onClick={() => toggleChatPinned(chat.id)}>{chat.pinned ? 'Desfixar' : 'Fixar'}</button>
                           <button className="danger" type="button" role="menuitem" onClick={() => deleteChat(chat.id)}>Excluir</button>
                         </div>
                       )}
                     </>
                   )}
                  </div>
                ))}
              </div>
            )}
          <button
            className={`nav-item ${view === 'memories' ? 'active' : ''}`}
            type="button"
            aria-current={view === 'memories' ? 'page' : undefined}
            onClick={() => navigate('memories')}
          >
            Memorias
          </button>
        </nav>
        {/* <button className="new-chat" type="button" aria-label="Novo chat" onClick={startNewChat}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M8 9.00006H6.2C5.0799 9.00006 4.51984 9.00006 4.09202 9.21805C3.71569 9.40979 3.40973 9.71575 3.21799 10.0921C3 10.5199 3 11.08 3 12.2001V17.8001C3 18.9202 3 19.4802 3.21799 19.908C3.40973 20.2844 3.71569 20.5903 4.09202 20.7821C4.51984 21.0001 5.07989 21.0001 6.2 21.0001H17.787C18.9071 21.0001 19.4671 21.0001 19.895 20.7821C20.2713 20.5903 20.5772 20.2844 20.769 19.908C20.987 19.4802 20.987 18.9202 20.987 17.8001V12.0001M6 15.0001H6.01M10 15H10.01M11.5189 12.8946L12.8337 12.6347C13.5432 12.4945 13.8979 12.4244 14.2287 12.2953C14.5223 12.1807 14.8013 12.0318 15.06 11.8516C15.3514 11.6487 15.607 11.393 16.1184 10.8816L21.2668 5.73321C21.9541 5.04596 21.9541 3.9317 21.2668 3.24444C20.5796 2.55719 19.4653 2.55719 18.7781 3.24445L13.5416 8.48088C13.0625 8.96004 12.8229 9.19963 12.6294 9.47121C12.4576 9.71232 12.3131 9.97174 12.1986 10.2447C12.0696 10.5522 11.9921 10.8821 11.837 11.5417L11.5189 12.8946Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button> */}
      </aside>

      <section className="chat" aria-label="Conteudo principal">
        <nav className="mobile-nav" aria-label="Navegacao principal">
          <button
            className={`nav-item ${view === 'chat' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate('chat')}
          >
            Chat
          </button>
          <button
            className={`nav-item ${view === 'memories' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate('memories')}
          >
            Memorias
          </button>
        </nav>

        {view === 'chat' ? (
          <>
            <div className="messages">
              {messages.map((item) => (
                <article className={`message ${item.author}`} key={item.id}>
                  {item.author === 'assistant' && (
                    <button
                      className="message-menu"
                      type="button"
                      aria-label="Mostrar memorias usadas"
                      aria-expanded={memoryMessageId === item.id}
                      onClick={() => setMemoryMessageId((current) => current === item.id ? null : item.id)}
                    >
                      ...
                    </button>
                  )}
                  <p>{item.text}</p>
                  {item.author === 'assistant' && (
                    <>
                      <div className="rating" aria-label="Avalie esta resposta">
                        <button type="button" aria-label="Resposta positiva">&#128077;</button>
                        <button type="button" aria-label="Resposta negativa">&#128078;</button>
                      </div>
                      {memoryMessageId === item.id && (
                        <section className="message-memories" aria-label="Memorias usadas nesta resposta">
                          <strong>Memorias</strong>
                          {memories.map((memoryItem) => (
                            <span key={memoryItem.id}>{memoryItem.text}</span>
                          ))}
                        </section>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <button className="create-memory" type="button" onClick={() => { setEditingMemoryId(null); setMemory(''); setIsMemoryOpen(true) }}>
                Criar memoria
              </button>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Escreva sua mensagem..."
                aria-label="Mensagem"
              />
              <button type="submit">Enviar</button>
            </form>

            {isMemoryOpen && (
              <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsMemoryOpen(false)}>
                <form className="memory-modal" onSubmit={editingMemoryId === null ? createMemory : editMemory} onMouseDown={(event) => event.stopPropagation()}>
                  <h1>{editingMemoryId === null ? 'Criar memoria' : 'Editar memoria'}</h1>
                  <input
                    autoFocus
                    value={memory}
                    onChange={(event) => setMemory(event.target.value)}
                    placeholder="Ex.: Prefere respostas curtas"
                    aria-label="Nova memoria"
                  />
                  <div className="modal-actions">
                    <button type="button" onClick={() => setIsMemoryOpen(false)}>Cancelar</button>
                    <button type="submit">{editingMemoryId === null ? 'Adicionar' : 'Salvar'}</button>
                  </div>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="memories-view">
            <header className="memories-header">
              <h1>Memorias</h1>
              <p>Conhecimentos explicitos salvos manualmente para uso do assistente.</p>
            </header>

            <div className="memories-toolbar" role="group" aria-label="Filtros e busca">
               <input
                 className="memories-search"
                 type="search"
                 value={memorySearch}
                 placeholder="Buscar memoria..."
                 aria-label="Buscar memoria"
                 onChange={(event) => {
                   setMemorySearch(event.target.value)
                   setTablePage(0)
                 }}
               />
               <select
                 className="memories-sort"
                 aria-label="Ordenar memorias"
                 value={memorySort}
                 onChange={(event) => {
                   setMemorySort(event.target.value as MemorySort)
                   setTablePage(0)
                 }}
               >
                 <option value="updated-desc">Atualizacao: mais recente</option>
                 <option value="updated-asc">Atualizacao: mais antiga</option>
                 <option value="created-desc">Criacao: mais recente</option>
                 <option value="created-asc">Criacao: mais antiga</option>
                 <option value="usage-desc">Uso: maior primeiro</option>
                 <option value="usage-asc">Uso: menor primeiro</option>
                 <option value="feedback-desc">Feedback: maior primeiro</option>
                 <option value="feedback-asc">Feedback: menor primeiro</option>
               </select>
              <select className="memories-filter" aria-label="Filtrar memorias" disabled defaultValue="all">
                <option value="all">Todas as memorias</option>
                <option value="positive">Com feedback positivo</option>
                <option value="negative">Com feedback negativo</option>
                <option value="unused">Sem uso recente</option>
              </select>
            </div>

            <div className="memories-table-wrap">
              <table className="memories-table" aria-label="Lista de memorias">
                <thead>
                  <tr>
                    <th>Texto</th>
                    <th>Feedback</th>
                    <th>Uso</th>
                    <th>Criado em</th>
                    <th>Atualizado em</th>
                    <th>Acoes</th>
                  </tr>
                 </thead>
                 <tbody>
                   {paginatedMemories.length > 0 ? paginatedMemories.map((m) => (
                       <tr key={m.id}>
                         <td>{m.text}</td>
                         <td className="num">{m.feedback_score}</td>
                         <td className="num">{m.usage_count}</td>
                         <td>{m.created_at}</td>
                         <td>{m.updated_at}</td>
                         <td className="memory-actions">
                           <button type="button" onClick={() => openMemoryEditor(m)}>Editar</button>
                           <button type="button" onClick={() => deleteMemory(m.id)}>Apagar</button>
                         </td>
                       </tr>
                     )) : (
                       <tr>
                         <td className="empty-state" colSpan={6}>Nenhuma memoria encontrada.</td>
                       </tr>
                     )}
                 </tbody>
              </table>
              <div className="pagination" role="group" aria-label="Paginacao da tabela">
                 <button type="button" disabled={currentTablePage === 0} onClick={() => setTablePage((p) => Math.max(0, p - 1))}>Anterior</button>
                 <span className="page-info">{currentTablePage + 1} de {totalTablePages}</span>
                 <button type="button" disabled={currentTablePage >= totalTablePages - 1} onClick={() => setTablePage((p) => Math.min(totalTablePages - 1, p + 1))}>Seguinte</button>
              </div>
            </div>

            <section className="clusters" aria-label="Agrupamentos de memorias">
              <header className="clusters-header">
                <h2>Memorias similares (&gt; 0,9)</h2>
                <p>Agrupamentos sugeridos para navegacao rapida.</p>
              </header>
              <div className="cluster-grid">
                {paginatedClusters.map((cluster) => (
                  <article className="cluster-card" key={cluster.id}>
                    <span className="cluster-count">{cluster.items.length} memorias</span>
                    <ul>
                      {cluster.items.map((item) => (
                        <li key={item.id} className="cluster-item">
                          <span className="cluster-item-text">{item.text}</span>
                          <span className="cluster-item-actions">
                            <button type="button" aria-label="Editar memoria" onClick={() => openMemoryEditor(memories.find((memoryItem) => memoryItem.id === item.id) ?? memories[0])}>
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M15.4998 5.50067L18.3282 8.3291M13 21H21M3 21.0004L3.04745 20.6683C3.21536 19.4929 3.29932 18.9052 3.49029 18.3565C3.65975 17.8697 3.89124 17.4067 4.17906 16.979C4.50341 16.497 4.92319 16.0772 5.76274 15.2377L17.4107 3.58969C18.1918 2.80865 19.4581 2.80864 20.2392 3.58969C21.0202 4.37074 21.0202 5.63707 20.2392 6.41812L8.37744 18.2798C7.61579 19.0415 7.23497 19.4223 6.8012 19.7252C6.41618 19.994 6.00093 20.2167 5.56398 20.3887C5.07171 20.5824 4.54375 20.6889 3.48793 20.902L3 21.0004Z" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button type="button" aria-label="Apagar memoria" onClick={() => deleteMemory(item.id)}>✕</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
              <div className="pagination" role="group" aria-label="Paginacao dos agrupamentos">
                <button type="button" disabled={currentClusterPage === 0} onClick={() => setClusterPage((p) => p - 1)}>Anterior</button>
                <span className="page-info">{currentClusterPage + 1} de {totalClusterPages}</span>
                <button type="button" disabled={currentClusterPage >= totalClusterPages - 1} onClick={() => setClusterPage((p) => p + 1)}>Seguinte</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
