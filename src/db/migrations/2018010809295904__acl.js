'use strict';

const Nodal = require('nodal');

class Acl extends Nodal.Migration {

  constructor(db) {
    super(db);
    this.id = 2018010809295904;
  }

  up() {

    return [
      'CREATE TABLE public.acl_meta\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value text[] COLLATE pg_catalog."default" NOT NULL,\n' +
      '    CONSTRAINT acl_meta_pkey PRIMARY KEY (key)\n' +
      ')',

      'CREATE TABLE public.acl_parents\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value text[] COLLATE pg_catalog."default" NOT NULL,\n' +
      '    CONSTRAINT acl_parents_pkey PRIMARY KEY (key)\n' +
      ')',

      'CREATE TABLE public.acl_permissions\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value json NOT NULL,\n' +
      '    CONSTRAINT acl_permissions_pkey PRIMARY KEY (key)\n' +
      ')',

      'CREATE TABLE public.acl_resources\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value text[] COLLATE pg_catalog."default" NOT NULL,\n' +
      '    CONSTRAINT acl_resources_pkey PRIMARY KEY (key)\n' +
      ')',

      'CREATE TABLE public.acl_roles\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value text[] COLLATE pg_catalog."default" NOT NULL,\n' +
      '    CONSTRAINT acl_roles_pkey PRIMARY KEY (key)\n' +
      ')',

      'CREATE TABLE public.acl_users\n' +
      '(\n' +
      '    key text COLLATE pg_catalog."default" NOT NULL,\n' +
      '    value text[] COLLATE pg_catalog."default" NOT NULL,\n' +
      '    CONSTRAINT acl_users_pkey PRIMARY KEY (key)\n' +
      ')'
    ];

  }

  down() {

    return [
      this.dropTable('acl_meta'),
      this.dropTable('acl_parents'),
      this.dropTable('acl_permissions'),
      this.dropTable('acl_resources'),
      this.dropTable('acl_roles'),
      this.dropTable('acl_users')
    ];

  }

}

module.exports = Acl;
