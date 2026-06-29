import factory

from apps.profiles.models import EmployerProfile, WorkerProfile

from .accounts import UserFactory


class WorkerProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WorkerProfile
        django_get_or_create = ("user",)

    user = factory.SubFactory(UserFactory)
    bio_title = "مطوّر برمجيات"
    # Fixtures stand in for real, live freelancers — publish them so they appear on public
    # surfaces (the model now defaults to DRAFT; rule D-1). Override per-test for draft cases.
    publish_state = WorkerProfile.PublishState.PUBLISHED


class EmployerProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EmployerProfile
        django_get_or_create = ("user",)

    user = factory.SubFactory(UserFactory)
    company_name = "شركة تجريبية"
