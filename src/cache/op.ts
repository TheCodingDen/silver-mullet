import { Entity } from 'redis-om'
import { Message, messageRepository } from './schema.js'

export async function addMessage (message: Message): Promise<Entity> {
  return await messageRepository.save(message)
}

export async function removeMessage (message: Message): Promise<void> {
  return void messageRepository.remove(message.messageId)
}

export async function fetchMessageById (messageId: string): Promise<Message> {
  return await messageRepository.fetch(messageId) as Message
}

export async function fetchMessagesByAuthor (authorId: string): Promise<Message[]> {
  return (await messageRepository.search()
    .where('authorId').equals(authorId)
    .return.all()) as Message[]
}
