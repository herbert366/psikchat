import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { APP_CONFIG } from '../src/config'
import { db } from '../src/mockDatabase'

async function openMemoriesView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Memorias' })[0])
}

beforeEach(() => {
  db.reset()
})

describe('App', () => {
  it('sends a message, renders an assistant reply, shows linked memories, and stores feedback', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'Mensagem' }), 'Quero comparar cenarios de RAG')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(screen.getByText('Quero comparar cenarios de RAG')).toBeInTheDocument()
    expect(await screen.findByText(/RAG mistura busca com geracao\./)).toBeInTheDocument()

    const memoryButtons = screen.getAllByRole('button', { name: 'Mostrar memorias usadas' })
    await user.click(memoryButtons.at(-1)!)

    const memoryPanel = screen.getByLabelText('Memorias usadas nesta resposta')
    expect(within(memoryPanel).getByText('Prefere comparar cenarios antes de decidir')).toBeInTheDocument()

    const positiveButtons = screen.getAllByRole('button', { name: 'Resposta positiva' })
    await user.click(positiveButtons.at(-1)!)
    expect(positiveButtons.at(-1)).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores blank messages and supports negative feedback on assistant replies', async () => {
    const user = userEvent.setup()

    render(<App />)

    const messageInput = screen.getByRole('textbox', { name: 'Mensagem' })
    const initialMessages = screen.getAllByRole('article').length

    await user.type(messageInput, '   ')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(screen.getAllByRole('article')).toHaveLength(initialMessages)
    expect(messageInput).toHaveValue('   ')

    await user.clear(messageInput)
    await user.type(messageInput, 'Quero comparar cenarios de RAG')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    const negativeButtons = screen.getAllByRole('button', { name: 'Resposta negativa' })
    const positiveButtons = screen.getAllByRole('button', { name: 'Resposta positiva' })

    await user.click(negativeButtons.at(-1)!)

    expect(negativeButtons.at(-1)).toHaveAttribute('aria-pressed', 'true')
    expect(positiveButtons.at(-1)).toHaveAttribute('aria-pressed', 'false')
  })

  it('supports creating, editing, searching, and deleting a manual memory through the UI', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getAllByRole('button', { name: 'Criar memoria' })[0])
    expect(screen.getByText(`0/${APP_CONFIG.maxCaracteresMemory}`)).toBeInTheDocument()

    const memoryInput = screen.getByRole('textbox', { name: 'Nova memoria' })
    await user.type(memoryInput, 'Mapa visual')
    expect(screen.getByText(`11/${APP_CONFIG.maxCaracteresMemory}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))

    await user.click(screen.getAllByRole('button', { name: 'Memorias' })[0])

    const searchInput = screen.getByRole('searchbox', { name: 'Buscar memoria' })
    await user.type(searchInput, 'Mapa')

    const createdRow = screen.getByText('Mapa visual').closest('tr')
    expect(createdRow).not.toBeNull()

    await user.click(within(createdRow!).getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByRole('textbox', { name: 'Nova memoria' }))
    await user.type(screen.getByRole('textbox', { name: 'Nova memoria' }), 'Mapa claro')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByText('Mapa claro')).toBeInTheDocument()

    const updatedRow = screen.getByText('Mapa claro').closest('tr')
    await user.click(within(updatedRow!).getByRole('button', { name: 'Apagar' }))

    expect(screen.getByText('Nenhuma memoria encontrada.')).toBeInTheDocument()
  })

  it('closes the memory modal from both cancel and backdrop actions', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Criar memoria' }))
    expect(screen.getByRole('heading', { name: 'Criar memoria' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('heading', { name: 'Criar memoria' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Criar memoria' }))
    await user.click(screen.getByRole('presentation'))

    expect(screen.queryByRole('heading', { name: 'Criar memoria' })).not.toBeInTheDocument()
  })

  it('manages chat creation, rename, pinning, selection, and deletion', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getAllByRole('button', { name: 'Novo chat' })[0])
    expect(screen.getByText('Novo chat')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opcoes de Novo chat' }))
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))

    const renameInput = screen.getByRole('textbox', { name: 'Renomear chat' })
    await user.clear(renameInput)
    await user.type(renameInput, 'Projeto de teste{enter}')
    expect(screen.getByText('Projeto de teste')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opcoes de Projeto de teste' }))
    await user.click(screen.getByRole('menuitem', { name: 'Fixar' }))
    expect(screen.getByLabelText('Chat fixado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bilhão e Valuation' }))
    expect(screen.getByText('Como penso sobre valuation de uma empresa?')).toBeInTheDocument()

    await user.click(screen.getByText('Projeto de teste'))
    await user.click(screen.getByRole('button', { name: 'Opcoes de Projeto de teste' }))
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }))

    expect(screen.queryByText('Projeto de teste')).not.toBeInTheDocument()
    expect(screen.getByText('Como posso ajudar voce hoje?')).toBeInTheDocument()
  })

  it('saves chat renames on blur and cancels them on escape', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Novo chat' }))
    await user.click(screen.getByRole('button', { name: 'Opcoes de Novo chat' }))
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))

    const renameInput = screen.getByRole('textbox', { name: 'Renomear chat' })
    await user.clear(renameInput)
    await user.type(renameInput, 'Rascunho pronto')
    await user.tab()

    expect(await screen.findByText('Rascunho pronto')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Opcoes de Rascunho pronto' }))
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))

    const renameInputAgain = screen.getByRole('textbox', { name: 'Renomear chat' })
    await user.clear(renameInputAgain)
    await user.type(renameInputAgain, 'Nao salvar{Escape}')

    expect(screen.getByText('Rascunho pronto')).toBeInTheDocument()
    expect(screen.queryByText('Nao salvar')).not.toBeInTheDocument()
  })

  it('toggles the chats list and deletes a non-active chat without changing the active conversation', async () => {
    const user = userEvent.setup()

    render(<App />)

    const chatsToggle = screen.getByRole('button', { name: 'Chats' })
    expect(chatsToggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(chatsToggle)
    expect(chatsToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Bilhão e Valuation' })).not.toBeInTheDocument()

    await user.click(chatsToggle)
    await user.click(screen.getByRole('button', { name: 'Opcoes de Bilhão e Valuation' }))
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }))

    expect(screen.queryByText('Bilhão e Valuation')).not.toBeInTheDocument()
    expect(screen.getByText('Como posso ajudar voce hoje?')).toBeInTheDocument()
  })

  it('paginates the memories table', async () => {
    const user = userEvent.setup()

    render(<App />)

    await openMemoriesView(user)

    const tablePagination = screen.getByRole('group', { name: 'Paginacao da tabela' })
    expect(within(tablePagination).getByText('1 de 2')).toBeInTheDocument()

    await user.click(within(tablePagination).getByRole('button', { name: 'Seguinte' }))
    expect(within(tablePagination).getByText('2 de 2')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Lista de memorias' })
    expect(within(table).getByText('Esta organizando metas semanais em formato de checklist')).toBeInTheDocument()
  })

  it('resets memory pagination on search and matches text without accents', async () => {
    const user = userEvent.setup()

    db.createMemory('Árvore util')

    render(<App />)

    await openMemoriesView(user)

    const tablePagination = screen.getByRole('group', { name: 'Paginacao da tabela' })
    await user.click(within(tablePagination).getByRole('button', { name: 'Seguinte' }))
    expect(within(tablePagination).getByText('2 de 2')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar memoria' }), 'arvore')

    expect(within(tablePagination).getByText('1 de 1')).toBeInTheDocument()
    expect(screen.getByText('Árvore util')).toBeInTheDocument()
  })

  it('sorts memories by the selected field and resets pagination to the first page', async () => {
    const user = userEvent.setup()

    render(<App />)

    await openMemoriesView(user)

    const tablePagination = screen.getByRole('group', { name: 'Paginacao da tabela' })
    await user.click(within(tablePagination).getByRole('button', { name: 'Seguinte' }))

    const sortSelect = screen.getByRole('combobox', { name: 'Ordenar memorias' })
    await user.selectOptions(sortSelect, 'usage-asc')

    expect(within(tablePagination).getByText('1 de 2')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Lista de memorias' })
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]!).getByText('Prefere comparar cenarios antes de decidir')).toBeInTheDocument()
  })

  it('shows the empty assistant memory state and lets the panel toggle closed again', async () => {
    const user = userEvent.setup()

    render(<App />)

    const memoryButton = screen.getAllByRole('button', { name: 'Mostrar memorias usadas' })[0]
    await user.click(memoryButton)

    const memoryPanel = screen.getByLabelText('Memorias usadas nesta resposta')
    expect(within(memoryPanel).getByText('Sem memorias relevantes.')).toBeInTheDocument()

    await user.click(memoryButton)
    expect(screen.queryByLabelText('Memorias usadas nesta resposta')).not.toBeInTheDocument()
  })

  it('supports editing and deleting linked memories from an assistant response panel', async () => {
    const user = userEvent.setup()

    db.addMessage(APP_CONFIG.seedChats[0].id, {
      id: 'message-linked-memory',
      author: 'assistant',
      text: 'Resposta com memorias usadas',
      memoryIds: [1, 2],
      rating: 0,
    })

    render(<App />)

    const memoryButton = screen.getAllByRole('button', { name: 'Mostrar memorias usadas' }).at(-1)!
    await user.click(memoryButton)

    const memoryPanel = screen.getByLabelText('Memorias usadas nesta resposta')
    const memoryItem = within(memoryPanel).getByText('Prefere listas objetivas').closest('li')
    expect(memoryItem).not.toBeNull()

    await user.click(within(memoryItem!).getByRole('button', { name: 'Editar memoria' }))
    await user.clear(screen.getByRole('textbox', { name: 'Nova memoria' }))
    await user.type(screen.getByRole('textbox', { name: 'Nova memoria' }), 'Listas claras')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(within(memoryPanel).getByText('Listas claras')).toBeInTheDocument()

    const updatedItem = within(memoryPanel).getByText('Listas claras').closest('li')
    await user.click(within(updatedItem!).getByRole('button', { name: 'Apagar memoria' }))

    expect(within(memoryPanel).queryByText('Listas claras')).not.toBeInTheDocument()
  })

  it('supports editing and deleting memories from the cluster cards', async () => {
    const user = userEvent.setup()

    render(<App />)

    await openMemoriesView(user)

    const clusterSection = screen.getByRole('region', { name: 'Agrupamentos de memorias' })
    const clusterItem = within(clusterSection).getByText('Prefere listas objetivas').closest('li')
    expect(clusterItem).not.toBeNull()

    await user.click(within(clusterItem!).getByRole('button', { name: 'Editar memoria' }))
    await user.clear(screen.getByRole('textbox', { name: 'Nova memoria' }))
    await user.type(screen.getByRole('textbox', { name: 'Nova memoria' }), 'Listas objetivas')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(within(clusterSection).getByText('Listas objetivas')).toBeInTheDocument()

    const updatedClusterItem = within(clusterSection).getByText('Listas objetivas').closest('li')
    await user.click(within(updatedClusterItem!).getByRole('button', { name: 'Apagar memoria' }))

    expect(within(clusterSection).queryByText('Listas objetivas')).not.toBeInTheDocument()
  })
})
