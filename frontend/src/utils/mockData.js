// Mock data for inboxes and conversations inspired by String UI

export const MOCK_INBOXES = [
  { id: "1", number: "(714) 769-6090", unreadCount: 1 },
  { id: "2", number: "(555) 123-4567", unreadCount: 0 },
];

export const MOCK_CONVERSATIONS = [
  {
    id: "c1",
    phoneNumber: "(714) 306-9589",
    lastMessage: "How about an appointment next Tuesday?",
    inboxNumber: "(714) 769-6090",
    date: "Wed 2/18",
    unread: false,
  },
  {
    id: "c2",
    phoneNumber: "65821",
    lastMessage: "Your verification code is 38492.",
    inboxNumber: "(714) 769-6090",
    date: "Wed 2/18",
    unread: true,
  },
  {
    id: "c3",
    phoneNumber: "(714) 855-9350",
    lastMessage: "Great, you're all set!",
    inboxNumber: "(714) 769-6090",
    date: "Tue 2/17",
    unread: false,
  },
  {
    id: "c4",
    phoneNumber: "(949) 289-1770",
    lastMessage: "We have two other provider options available.",
    inboxNumber: "(714) 769-6090",
    date: "Tue 2/17",
    unread: false,
  },
];

export const MOCK_USER = {
  id: "u1",
  email: "provider@clinic.demo",
  organizationName: "Demo Clinic",
  initials: "DC",
};

